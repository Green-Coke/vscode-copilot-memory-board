# 工作区大小统计与初始状态注入指南

本指南记录了在 2026-06 引入的两大核心机制：**VS Code 初始状态注入（State Injection）以解决冷启动渲染闪烁** 与 **工作区物理存储目录大小的静默计算与增量推送（Workspace Size Computation & Push）**。

---

## 1. 状态注入机制 (State Injection) — 消除冷启动闪烁

### 1.1 背景与痛点
在之前的版本中，前端 React App 启动时：
1. 初始 state 使用 `@memory-board/core` 中的 `DEFAULT_UI_PREFERENCES` 和 `DEFAULT_WORKSPACE_STATE` 进行首帧渲染。
2. 通过 `useEffect` 向扩展端（Host）发起异步请求（`getUiPreferences` / `getWorkspaceState`）。
3. 扩展端读取 memento 并异步返回，前端收到后触发 `setState` 重新渲染。

这导致在首帧与扩展返回响应的 50ms ~ 150ms 之间，排序、钉选、语言等状态呈现出“默认状态”，随后瞬间切回持久化值，在视觉上产生难看的闪烁，且容易让用户误以为钉选状态“丢失”。

### 1.2 解决方案：Host 端 HTML 模板注入
通过在扩展端（Host）返回 webview 的 HTML 页面时，动态注入最新状态：
1. **注入脚本构造**：
   在 `webview-provider.ts` 的 `getHtmlForWebview` 方法中，读取最新的状态数据：
   ```typescript
   const uiPreferences = this.readUiPreferences();
   const workspaceState = this.readWorkspaceState();
   const initialState = {
     uiPreferences,
     workspaceState,
     showRedirectSelector: this.showRedirectSelector,
     language: vscode.env.language,
   };
   // 必须携带与 CSP 策略一致的 nonce，否则会被浏览器安全阻断
   const initialStateScript = `<script nonce="${nonce}">window.__INITIAL_MEMORY_BOARD_STATE__ = ${JSON.stringify(initialState)};</script>`;
   html = html.replace(/<head[^>]*>/i, (match) => `${match}\n  ${initialStateScript}`);
   ```
2. **前端首帧读取 (Get Injected State)**：
   在 `gui/src/lib/bridge.ts` 中暴露获取函数（非 VS Code 模式如 standalone 浏览器环境则直接返回 `null`）：
   ```typescript
   export function getInjectedInitialState() {
     if (currentEnvironment !== "vscode") return null;
     return (window as any).__INITIAL_MEMORY_BOARD_STATE__ || null;
   }
   ```
3. **React Hooks 改造 (useBridge)**：
   在 `useUiPreferences` 与 `useWorkspaceState` 中，以注入的值作为 React 状态的初始值。如果已成功注入，则直接将 `loading` 状态初始化为 `false`，并跳过后续向 Host 的冗余请求：
   ```typescript
   const injected = getInjectedInitialState();
   const [state, setState] = useState<WorkspaceState>(
     injected?.workspaceState ?? cloneDefaultWorkspace()
   );
   const [loading, setLoading] = useState(!injected?.workspaceState);

   useEffect(() => {
     if (injected?.workspaceState) return; // 注入成功则直接跳过网络拉取
     // 兜底拉取逻辑...
   }, [injected]);
   ```

---

## 2. 状态落盘同步保障

为根治用户在修改排序、钉选后立即关闭 VS Code 导致 SQLite 写入未完成、下次打开依旧是旧状态的 Bug，我们将 Host 端的写入动作由 `void` (fire-and-forget) 改为 `Promise`：
1. `writeUiPreferences` 与 `writeWorkspaceState` 改为 `async` 方法，并使用 `await` 等待 `update` 操作：
   ```typescript
   private async writeWorkspaceState(patch: Partial<WorkspaceState>): Promise<WorkspaceState> {
     const next = this.mergeWorkspaceState(this.readWorkspaceState(), patch);
     await this.context.workspaceState.update(WORKSPACE_STATE_KEY, next);
     return next;
   }
   ```
2. 在 `handleMessage` 的路由中，必须使用 `await` 堵塞消息响应的返回，确保落盘完成后，前端才会收到成功响应。

---

## 3. 工作区物理目录大小统计与调度

为了向用户展示每个工作区的缓存/记忆占用容量，我们实现了在后台静默计算、串行调度、以及增量推送大小的机制。

### 3.1 物理目录大小的计算安全 (`MemoryParser`)
在 `core/src/memory-parser.ts` 中实现：
- **最大深度防护**：限制递归深度上限为 30 层，防止深层死循环。
- **循环 symlink 保护**：使用 `Set<number>` 收集扫描过的 `stat.ino` (inode)，若遇到已经访问过的 inode 则直接跳过，防止符号链接产生无限循环。
- **让出 CPU (CPU Yielding)**：每扫描 50 个文件，通过 `await new Promise(r => setTimeout(r, 0))` 挂起当前任务并让出事件循环主线程，确保扫描上万个文件时 Host 环境完全不卡顿、不影响其他插件和 IDE 功能。
  ```typescript
  if (fileCount % 50 === 0) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  ```

### 3.2 后端串行调度与增量推送 (`WebviewCore`)
大小计算比较消耗 I/O，因此在 Host 端采取了优化的后台调度：
1. **优先调度**：将当前激活的 `currentWorkspaceId` 放在待计算列表的第一位，保证用户当前项目的大小最先算完显示出来。
2. **AbortController 控制**：维护一个私有的 `sizeComputeAbortController`。在收到新的大小计算请求，或用户点击顶部刷新按钮时，自动调用 `abort()` 中断旧的计算线程，开启新的一轮计算，防止后台任务堆积与数据覆盖。
3. **极简增量式主动推送**：为避免累积累加推送导致消息载荷不断递增，Host 端优化为每次计算完毕后仅推送单条容量键值对，消息载荷大幅降至百字节以内：
   ```typescript
   webview.postMessage({
     type: "onWorkspaceSizesChanged",
     requestId: "",
     payload: { sizes: { [id]: size } },
     error: null,
   });
   ```

### 3.3 前端按需精准触发与防抖控制 (On-Demand Trigger & Optimization)
大小计算是由前端按需触发的，而非全量无节制运行：
- **依赖项防重优化**：
  在 `WorkspaceList.tsx` 中，由于可见项列表（`pinned` 和 `visibleUnpinned`）是由 `useMemo` 派生的新数组实例，每次渲染时引用都会发生改变，从而导致 `useEffect` 被频繁触发引起 `AbortController` 不断 abort。
  为了解决这一问题，我们将可见项的 ID 序列化为逗号分隔的字符串：
  ```typescript
  const visibleIdsStr = useMemo(() => {
    return [
      ...pinned.map((w) => w.id),
      ...visibleUnpinned.map((w) => w.id),
    ].join(",");
  }, [pinned, visibleUnpinned]);
  ```
  在 `useEffect` 中，将依赖项改为 `visibleIdsStr`。只有当可见列表的内容真正改变时才发起 `requestCompute(visibleIds)` 请求，保证了调度的极致稳定性。
- **好处**：用户在未点击“加载更多”前，只会计算前 5 个可见项目。滑动、搜索或者点击加载更多等操作只触发新出现项目的容量计算，旧的计算任务也会被 Host 自动 abort 掉，确保极低的 CPU/IO 负荷。
- **国际化多语言支持**：
  在未计算出大小前，为了防止硬编码 `"…"` 的局限性，在 `locales` 的 `en` 和 `zh-cn` 资源中补充了 `calculating`（分别翻译为 "calculating..." 和 "计算中..."），并使用 `t("workspaces.calculating")` 进行标准渲染。
- **环境隔离**：如果是浏览器独立运行模式（standalone），则前端直接屏蔽显示，规避一切不必要的后台计算。
