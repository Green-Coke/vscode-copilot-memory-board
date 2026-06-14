# Mock 清理与真实磁盘接入指南

本文档记录 2026-06-14 完成的「移除 GUI mock 数据 + 三端（VS Code 扩展 / Vite 网页 standalone / core 单测）真实读盘接入」改造的关键决策与坑点。

---

## 一、5 个独立 Bug 与修复

### 1.1 显示「只一个 workspace」

**根因**：`extensions/vscode/src/webview-provider.ts` 的 `scanWorkspacesCached(forceAll=false)` 默认只调用 `parser.scanCurrentWorkspace()`，全扫方法 `scanWorkspaces()` 在 core 中已实现但未被使用。

**修复**：将默认改为始终调用 `scanWorkspaces()`，`forceRefresh` 参数仅用于强制清空缓存：

```typescript
private async scanWorkspacesCached(forceRefresh = false): Promise<Workspace[]> {
  if (!this.parser) return [];
  if (this.workspacesCache && !forceRefresh) return this.workspacesCache;
  const workspaces = await this.parser.scanWorkspaces();
  this.workspacesCache = workspaces;
  return workspaces;
}
```

### 1.2 session 全是「<未命名会话>」

**根因（亲验磁盘）**：`core/src/memory-parser.ts` 中 `tryReadSessionMetadata` 把 jsonl 路径拼成 `<ws>/GitHub.copilot-chat/chatSessions/<id>.jsonl`，但实测磁盘上 `chatSessions` 与 `GitHub.copilot-chat` 是 **平级兄弟目录**：

```
workspaceStorage/<id>/
├── chatSessions/<sessionId>.jsonl       ← 真实路径（在 workspaceId 下，不在 GitHub.copilot-chat 里）
├── GitHub.copilot-chat/
│   └── memory-tool/memories/...
└── workspace.json
```

**修复**：去掉路径里多余的 `"GitHub.copilot-chat"` 一层。

### 1.3 文件列表是 mock 数据

**根因**：`gui/src/components/MemoryViewer.tsx` 直接静态 import `getMockFileTree` 调用，绕过了 bridge。

**修复**：
1. 删除两个 mock 文件（`gui/src/lib/mock-data.ts`、`gui/src/lib/mock-filetree.ts`）
2. 新建 `gui/src/lib/file-tree-types.ts`（共享 `FileTreeNode` 类型，从原 `MockFsNode` 改名而来）
3. 新建 `gui/src/hooks/use-file-tree.ts`：从 `MemoryEntry[]` 直接构造 FileTreeNode 树（真实 memory 是平铺的 .md 文件，没有子目录）
4. `MemoryViewer` 改用 `useFileTree(entries)`，删除 mock 调用

### 1.4 点击不存在的文件不报错（兜底创建 Untitled）

**根因**：`openDocumentInVsCode` 在 `filePath` 不存在时会创建 Untitled 虚拟文档。

**修复**：行为改为「文件不存在 → `vscode.window.showErrorMessage('Memory 文件不存在：<path>')`」，不创建 Untitled。同时把 `MemoryEntry.sourceFile` 从单纯的文件名（如 `plan.md`）改为完整绝对路径（如 `C:\Users\...\plan.md`），让 bridge openFile 能传完整 disk path 给扩展端。

### 1.5 VS Code 模式下打开后不知道当前 workspaceId

**根因**：`attachWebview` 不主动推送；GUI 没有 `getCurrentWorkspace` 协议。

**修复**：
- `core/src/protocol.ts` 新增 `getCurrentWorkspace` 请求/响应类型与 `MessageTypes.GET_CURRENT_WORKSPACE` 枚举
- 扩展端 `handleMessage` 新增 case：从 `this.currentWorkspaceId` + `workspacesCache` 中查找并返回真实 Workspace
- GUI 新增 `useCurrentWorkspace` hook
- `App.tsx` 加入 effect：当 workspaces 加载完成、用户还没手动选过 workspace 时，自动选中 currentWs，并切换 view 到 "sessions"

---

## 二、三端真实读盘方案

### 2.1 VS Code 扩展端

通过 `context.storageUri` 反推 workspaceStorage 根路径。环境变量 `MEMORY_BOARD_WS_STORAGE_OVERRIDE` 可用于 e2e 测试注入 tmpdir fixture：

```typescript
const override = process.env["MEMORY_BOARD_WS_STORAGE_OVERRIDE"];
const basePath = (override && override.trim().length > 0)
  ? override
  : this.workspaceStoragePath;
this.parser = new MemoryParser({ basePath, currentWorkspaceId: this.currentWorkspaceId });
```

### 2.2 Vite 网页 standalone 模式（核心新增）

**问题**：浏览器无法直接读 fs。

**方案 A 实现（已选定）**：在 `gui/vite-plugin-memory-board.ts` 实现一个 Vite 插件，挂中间件到 dev server，复用 core 的 `MemoryParser` 扫描真实磁盘：

URL 约定：
- `GET /api/__memory_board/workspaces?insiders=false`
- `GET /api/__memory_board/workspaces/:id/sessions`
- `GET /api/__memory_board/workspaces/:id/sessions/:sessionId/memory`

路径探测：
- Windows: `%APPDATA%/Code/User/workspaceStorage` (stable) 或 `%APPDATA%/Code - Insiders/User/workspaceStorage` (insiders)
- macOS: `~/Library/Application Support/Code/User/workspaceStorage`
- Linux: `~/.config/Code/User/workspaceStorage`
- 覆盖优先级：`?override=<path>` → `MEMORY_BOARD_WS_STORAGE_OVERRIDE` → 自动探测

`gui/src/lib/bridge.ts` 的 standalone 分支用 `fetch()` 调这些 URL；VS Code 模式仍走 `postMessage`。

### 2.3 UI 切换 Stable / Insiders

`AppHeader`（仅 standalone 渲染）新增「Stable / Insiders」切换按钮，写入 `localStorage: memory-board:scan-target`，切换后强制 `window.location.reload()` 让所有 hooks 重新走 fetch。

---

## 三、关键 API 与坑点

### 3.1 Vite 插件 `configureServer` 中间件

```typescript
import type { Plugin } from "vite";

export function memoryBoardDevPlugin(): Plugin {
  return {
    name: "memory-board-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(API_PREFIX)) return next();
        // 处理请求...
      });
    },
  };
}
```

**关键点**：
- 必须返回 `next()` 让其他中间件继续处理非 API 路径
- 仅在 `vite dev` 时生效；`vite build` 不挂中间件
- production standalone build 仅 UI，不能读盘（开发调试为主）

### 3.2 VS Code 文件打开行为（修订）

根据用户反馈，**不再兜底创建 Untitled 文档**：

```typescript
private async openDocumentInVsCode(name: string, _content: string, filePath?: string): Promise<void> {
  if (!filePath || filePath.trim().length === 0) {
    await vscode.window.showErrorMessage(`Memory 文件未指定路径：${name}`);
    return;
  }
  if (!fs.existsSync(filePath)) {
    await vscode.window.showErrorMessage(`Memory 文件不存在：${filePath}`);
    return;
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc, { preview: true });
}
```

### 3.3 路径推断：workspaceId 的来源

不要用 `vscode.env.appQuality`（proposed API，普通扩展用不了）。从 `context.storageUri.fsPath` 反推路径时按 `path.sep` 拆分，找 `workspaceStorage` 索引：

```typescript
const parts = storageUri.fsPath.split(path.sep).filter((p) => p.length > 0);
const wsIdx = parts.findIndex((p) => p.toLowerCase() === "workspacestorage");
const workspaceId = parts[wsIdx + 1];
const workspaceStoragePath = parts.slice(0, wsIdx + 1).join(path.sep);
// 提示：parts[wsIdx + 1] 类型是 `string | undefined`，需要 if (!workspaceId) return undefined;
```

### 3.4 文件系统路径协议字段命名

- `MemoryEntry.sourceFile`：**绝对路径**（如 `C:\Users\...\plan.md`），用于 bridge openFile 时给扩展端使用
- `MemoryEntry.id`：组合字符串 `${sessionId}::${filename}`，仅用于 React key / 缓存
- `OpenFileRequest.path`：与 sourceFile 一致的绝对路径，扩展端做 `fs.existsSync` 检查

### 3.5 GUI 自动选中「当前 workspace」的封装

`App.tsx` 加入 ref 标记防止用户手动改选后被覆盖：

```typescript
const userPickedWorkspaceRef = useRef(false);

useEffect(() => {
  if (userPickedWorkspaceRef.current) return;
  if (!workspaces?.length) return;
  const target = currentWs && workspaces.find((w) => w.id === currentWs.id)
    || workspaces[0];
  if (!target) return;
  if (selectedWorkspace?.id === target.id) return;
  setSelectedWorkspace(target);
  setViewingWorkspaceFiles(false);
  setCurrentView("sessions");
}, [workspaces, currentWs, selectedWorkspace]);

const handleSelectWorkspace = useCallback((workspace: Workspace) => {
  userPickedWorkspaceRef.current = true;
  setSelectedWorkspace(workspace);
  // ...
}, []);
```

---

## 四、Mock 文件彻底清空检查

```bash
# gui/src 中应无任何 mock 引用
grep -rn "mock-data\|getMockFileTree\|MOCK_WORKSPACES\|MOCK_SESSIONS\|MOCK_ENTRIES\|MockFsNode\|handleMockRequest" gui/src
# 期望：No matches found

# mock 文件应已删除
ls gui/src/lib/mock-data.ts gui/src/lib/mock-filetree.ts 2>&1
# 期望：No such file or directory
```

**保留范围**：
- `e2e/memory-board.spec.ts` 中的测试用例（其行为不依赖 mock 的具体数据结构）
- core 单测的 `core/test/memory-parser.test.ts` 中的 tmpdir fixture（生产用 MemoryParser，单测用临时目录构造数据 — 这是「测试夹具」而非「mock」）

---

## 五、本次新增 / 修改的文件清单

**新建**：
- `gui/src/lib/file-tree-types.ts` — 共享 `FileTreeNode` 类型
- `gui/src/hooks/use-file-tree.ts` — 从 MemoryEntry[] 构造 FileTreeNode 树
- `gui/vite-plugin-memory-board.ts` — dev server 中间件，复用 core 的 MemoryParser

**修改**：
- `core/src/memory-parser.ts` — 修 jsonl 路径；修 sourceFile 为绝对路径
- `core/src/protocol.ts` — 新增 `getCurrentWorkspace` 协议与枚举
- `core/test/memory-parser.test.ts` — fixture 路径与真实磁盘结构对齐
- `extensions/vscode/src/webview-provider.ts` — 默认全扫；新增 getCurrentWorkspace case；openFile 行为改为报错不创建 Untitled
- `gui/vite.config.ts` — 引入 memoryBoardDevPlugin
- `gui/src/lib/bridge.ts` — 删除 handleMockRequest；standalone 改走 HTTP fetch；新增 scanTarget localStorage 序列化
- `gui/src/hooks/use-bridge.ts` — 新增 useCurrentWorkspace；useMemoryContent 支持 workspaceId
- `gui/src/components/MemoryViewer.tsx` — 删 mock 调用；改用 useFileTree；node.absolutePath 传给 openFile
- `gui/src/components/FileTree.tsx` — MockFsNode → FileTreeNode
- `gui/src/components/FilePreview.tsx` — MockFsNode → FileTreeNode
- `gui/src/lib/sort-utils.ts` — MockFsNode → FileTreeNode
- `gui/src/components/Layout.tsx` — AppHeader 加 Stable/Insiders 切换器
- `gui/src/App.tsx` — 自动选中当前 workspace；useMemoryContent 传 workspaceId；handleBackToWorkspaces 保留 selectedWorkspace

**删除**：
- `gui/src/lib/mock-data.ts`
- `gui/src/lib/mock-filetree.ts`

---

## 六、验证手段

1. **typecheck**：`pnpm -r run typecheck` 全绿（core / gui / extensions/vscode 三端）
2. **core 单测**：`pnpm --filter @memory-board/core test -- --run` 40 用例全过
3. **standalone 中间件实测**：
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:5175/api/__memory_board/workspaces"
   # 应返回当前用户 workspaceStorage 下的真实 Workspace 列表
   Invoke-RestMethod -Uri "http://localhost:5175/api/__memory_board/workspaces/:id/sessions"
   # 应返回真实 session 标题（如「制定Copilot memory文件加载计划」），不再有「<未命名会话>」
   Invoke-RestMethod -Uri "http://localhost:5175/api/__memory_board/workspaces/:id/sessions/_repo_/memory"
   # sourceFile 字段应为绝对路径，content 字段是 .md 文件真实正文
   ```
4. **生产 build**：`pnpm package:vsix`；安装 .vsix 后打开 Memory Board，应显示所有 workspaceStorage 子目录下的 workspace + 真实 session 标题
