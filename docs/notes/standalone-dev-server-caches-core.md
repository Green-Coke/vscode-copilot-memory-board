# Standalone Dev Server 缓存 core dist 导致浏览器数据缺字段

> 2026-06-14 总结：用 vite dev server 跑 standalone GUI 时，修改 core 后必须重启 dev server 才能 sees new core dist，否则浏览器会拿到旧数据导致前端崩溃。

## 一、问题现象

修改 `core/src/types.ts` 给 `MemoryEntry` 增加了 `relativePath` / `isDirectory` 字段，对应改了 `readMemoryContent` 让其递归扫描。重新 `pnpm build` core 后：

| 入口 | 结果 |
|------|------|
| VS Code 扩展（`extensions/vscode/...`） | ✅ 正常显示目录与文件 |
| 浏览器 standalone（`gui npm run dev`） | ❌ `entry.relativePath.split is undefined` 整页崩溃 |

## 二、根因

- standalone 模式下浏览器不能直接读 fs，而是 fetch 到 `vite-plugin-memory-board.ts` 暴露的 HTTP 端点
- 该中间件通过 `import { MemoryParser } from "@memory-board/core"` 引用 core 的 **dist 产物**
- vite dev server 是一个长驻 Node 进程，启动时一次性 require core dist 并缓存在模块系统里
- 后续 `pnpm build` core 后，**dist 文件确实更新了**（已验证 `dist/types.d.ts` 含 `relativePath`）
- 但已经运行的 dev server 进程没有重启，所以 server 端仍在用旧版 `MemoryParser.readMemoryContent`，返回的 entries 不含新字段

## 三、必走的开发流程

| 改了什么 | 必做的操作 |
|----------|-----------|
| `core/**` | 1. `cd core && pnpm build`  2. **重启** `gui` 的 `pnpm dev` 进程  3. 浏览器硬刷新 |
| `extensions/vscode/**` | `Developer: Reload Window`（VS Code 命令面板） |
| `gui/**` | vite HMR 通常足够；个别 `vite.config.ts` 改动需要重启 |

**切记**：core 改了但 dev server 没重启，是 standalone 模式最常见的「数据突然少字段」踩坑点。

## 四、前端兜底（已落地，避免再崩溃）

为防止类似情况再次发生导致整页不可用，做了三层防御：

### 1. use-file-tree.ts — 数据兜底

新增 `safeRelativePath(entry)`：

```ts
function safeRelativePath(entry: MemoryEntry): string {
  if (typeof entry.relativePath === "string" && entry.relativePath.length > 0) {
    return entry.relativePath;
  }
  // 旧版数据无 relativePath，从 sourceFile basename 退化
  if (typeof entry.sourceFile === "string" && entry.sourceFile.length > 0) {
    const base = entry.sourceFile.split(/[\\/]/).pop();
    if (base) return base;
  }
  // 极端情况：只剩下 id（格式应为 `${sessionId}::${filename}`）
  if (typeof entry.id === "string" && entry.id.length > 0) {
    const idx = entry.id.lastIndexOf("::");
    if (idx >= 0) return entry.id.slice(idx + 2);
    return entry.id;
  }
  return "unknown";
}
```

`entryToNode` / `entriesToFileTree` 全部改用此函数，并对 `entry.isDirectory === true` 显式判断。

### 2. entriesToFileTree — 整体 try/catch

```ts
export function entriesToFileTree(entries: MemoryEntry[]): FileTreeNode[] {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  try {
    // ... 构树逻辑
  } catch (err) {
    console.error("[useFileTree] entriesToFileTree 构造树失败，降级返回空数组", err, entries);
    return [];
  }
}
```

### 3. App.tsx — ErrorBoundary 包裹 MemoryViewer

新增 `gui/src/components/ErrorBoundary.tsx`（React 19 仍必须用 class component），在 App.tsx 用它包裹 `<MemoryViewer>`：

```tsx
<ErrorBoundary onError={(err) => console.error("[App] MemoryViewer 渲染异常：", err)}>
  <MemoryViewer ... />
</ErrorBoundary>
```

错误回退面板暗色风格，展示 error.message + stack 前 3 行，提供「重试」按钮。今后任何渲染异常都不会让界面只剩背景色。

## 五、关键经验

1. **Node 模块缓存** 是 dev server 看不见 core 新版的根因；standalone 模式开发必须记得重启
2. **前端永远要做兼容兜底**：旧版/未升级的字段缺失不能让整页崩溃
3. **ErrorBoundary** 在 React 应用里应该是必需品，特别是处理外部数据（fetch / postMessage）的场景
4. **测试不能只覆盖 core**：standalone 路径下 `core → vite-plugin → fetch → entriesToFileTree → React` 链路很长，每一段都可能炸；尽可能在前端代码里把每段的「输入容错」做完
