# Webview 焦点保留、IDE 重定向与推送刷新指南

本指南总结了在开发 Memory Board 插件时，针对 VS Code 与派生 IDE（如 Antigravity IDE）环境的三个核心问题的解决方案与 API 实践：

1. Webview 打开文档时的焦点丢失问题（`preserveFocus: true`）
2. 跨 IDE (VS Code 与 Antigravity IDE) 共享工作区缓存（`workspaceStorage`）的路径重定向
3. 静态声明 `secondarySideBar` 视图容器引起的兼容性警告及规避方案
4. 基于 `onPushMessage` 与 `refetch` 的多端同步自动刷新机制

---

## 1. Webview 打开文档时的焦点保留机制

### 核心问题
在 VS Code 插件开发中，若 Webview 内含有文件树，点击文件时我们通常需要调用 `vscode.window.showTextDocument` 在右侧编辑器中打开该文件。
默认情况下，VS Code 会强制将焦点（Focus）转移到新打开的编辑器 Tab 页面中。这会导致：
- Webview 瞬间失去焦点。
- 用户如果紧接着按下 `Ctrl+C`、`Ctrl+V` 或 `F2` 等键盘快捷键，这些事件将无法在 Webview 的事件监听器中被捕获，而是被编辑器接收，从而导致快捷键复制粘贴或重命名失效。

### 解决方案
在调用 `vscode.window.showTextDocument` 时，传入 `preserveFocus: true` 属性：

```typescript
// 推荐的打开文件方式
const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
await vscode.window.showTextDocument(doc, { 
  preview: true, 
  preserveFocus: true // 关键：打开编辑器但保持当前焦点留在 Webview 内
});
```

*作用*：编辑器会在后台或右侧被静默打开，而输入焦点依然完美保留在 Webview 文件树上，保障了后续所有的快捷键交互流程极其流畅。

---

## 2. 跨 IDE 的 workspaceStorage 路径重定向与通用第三方 IDE 检测

### 核心问题
Antigravity IDE 等 VS Code 衍生 IDE 在运行时，其 `context.storageUri` 会指向其自身的应用数据目录（如 `%APPDATA%\Antigravity IDE`）。由于 GitHub Copilot Chat 等插件只运行在标准的 VS Code 中，其生成的所有 memories 会话缓存全部位于 VS Code 的官方目录（`%APPDATA%\Code`）下。所以在派生 IDE 中运行本插件时，默认会因为无法获取 VS Code 缓存而显示“暂无工作区”。

### 通用解决方案
为了避免硬编码特定第三方 IDE 名称，本插件设计了**通用第三方 IDE 检测与动态重定向机制**，并在 GUI 中配合自适应条件渲染缓存切换选择器：

1. **绝对路径与 App 目录解析**：
   在 `resolveWorkspaceStoragePath` 中，对 `storageUri.fsPath` 通过路径分隔符进行拆分，定位到 `workspaceStorage` 的上二级目录，即当前宿主 IDE 的应用数据名 `currentAppName`。同时，修复了 macOS/Linux 系统绝对路径拼接时可能丢失开头分隔符的问题。
   ```typescript
   const parts = storageUri.fsPath.split(path.sep).filter((p) => p.length > 0);
   const wsIdx = parts.findIndex((p) => p.toLowerCase() === "workspacestorage");
   // currentAppName 即为 AppData/Roaming 下的 IDE 目录名
   const currentAppName = wsIdx >= 2 ? parts[wsIdx - 2] : "";
   ```

2. **多维度官方/第三方 IDE 判定**：
   结合 `currentAppName`、`vscode.env.appName` 与 `vscode.env.uriScheme`，确定当前环境是否属于官方 VS Code。
   若非官方版（如 `currentAppName` 既非 `Code` 也非 `Code - Insiders`），则设置 `showRedirectSelector = true` 并传递给前端，此时工作区列表顶部才会展示 VS Code 缓存切换按钮。
   ```typescript
   const isOfficialVSCode = (() => {
     if (!currentAppName) return true;
     const appNameLower = currentAppName.toLowerCase();
     if (appNameLower === "code" || appNameLower === "code - insiders" || appNameLower === "code-insiders") {
       return true;
     }
     // 辅以 vscode.env 判断
     const envAppName = vscode.env.appName ? vscode.env.appName.toLowerCase() : "";
     const envUriScheme = vscode.env.uriScheme ? vscode.env.uriScheme.toLowerCase() : "";
     if (envAppName.includes("visual studio code") || envUriScheme.startsWith("code")) {
       return true;
     }
     return false;
   })();
   const showRedirectSelector = !isOfficialVSCode;
   ```

3. **动态目录替换重定向**：
   若开启重定向，直接在 `parts` 数组对应位置将 `currentAppName` 动态替换为 `Code` 或 `Code - Insiders`，即可自动兼容任何非官方 VS Code IDE 宿主环境的缓存重定向。
   ```typescript
   const targetDirName = redirectTarget === "insiders" ? "Code - Insiders" : "Code";
   const redirectedParts = [...parts];
   redirectedParts[wsIdx - 2] = targetDirName;
   ```

4. **空态下的交互保留**：
   即使当前工作区列表为空（`workspaces.length === 0`，比如在衍生 IDE 刚安装插件尚未重定向时），顶部的重定向切换选择框也必须保持可见（在顶栏下方渲染空态提示），方便用户操作重定向到 VS Code 缓存。

5. **自动化测试覆盖**：
   在 `e2e/memory-board.spec.ts` 中，通过在 Playwright 启动时使用 `page.addInitScript` 注入 Mock 版的 `window.acquireVsCodeApi` 模拟扩展端 postMessage 通信，分别测试 `showRedirectSelector: true` 与 `false` 时，缓存选择按钮的可见性，确保在官方 IDE 和第三方 IDE 下均符合预期。

> **关于 context key + `when` 子句的官方用法示例**
>
> VS Code 通过 `contributes.menus` 中的 `when` 字段配合自定义 context key 控制视图/命令的可见性。本项目 `extensions/vscode/package.json` 中的实例:
> ```jsonc
> "views": {
>   "memory-board-sidebar": [{
>     "id": "memoryBoard.mainView",
>     "when": "memoryBoard.activeLocation == sidebar"  // 自定义 context key
>   }]
> }
> ```
> 扩展端通过 `vscode.commands.executeCommand('setContext', 'memoryBoard.activeLocation', 'sidebar')` 动态切换。详见官方文档 [when clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts)。

---

## 3. 静态声明 `secondarySideBar` 容器的警告与规避

### 核心问题
如果在 `package.json` 中的 `viewsContainers` 静态贡献了 `secondarySideBar`（辅助侧边栏）键：
```json
"viewsContainers": {
  "secondarySideBar": [ ... ]
}
```
因为此字段不是一直存在的稳定 API 贡献点（具体稳定化的版本号请以当前 VS Code `package.json` 的 `engines.vscode` 约束和实际验证为准;不同 VS Code 版本与衍生 IDE 支持情况不一）,在低于该版本的 VS Code 正式版以及不支持此贡献点的衍生 IDE 中，解析 `package.json` 会导致报错：
`视图容器"xxxx"不存在。所有注册到其中的视图将被添加到"资源管理器"中。`

> **核实提示**:`secondarySideBar` 容器的精确稳定版本号官方文档未明确列示。本项目采用「`when` 子句 + `context key` 控制」的双视图(`memoryBoard.mainView` / `memoryBoard.bottomPanelView`)方案规避,见 `extensions/vscode/package.json` 的 `contributes.views`。

### 解决方案
为了保障最佳的向下兼容性及消灭此类报错，最佳实践是**避免在 `package.json` 中静态声明 `secondarySideBar` 容器及相关的命令**，只声明 `activitybar` (主侧栏) 和 `panel` (底部面板)。
在新版本的 VS Code 中，移除此静态注册不会影响用户使用辅助侧栏。VS Code 支持原生的 **拖放（Drag & Drop）** 布局定制，用户可以直接用鼠标将 Memory Board 视图从主侧栏直接拉拽到辅助侧边栏，宿主端会完全支持并保持该拖拽状态。

---

## 4. 基于推送消息的自动多端同步刷新

### 核心问题
执行文件变更操作后，如果只是单向调用 Bridge 修改磁盘，界面上的列表不会自动更新。刷新按钮也可能因为仅刷新了 workspaces 缓存而无法更新文件树。

### 解决方案
1. **扩展端广播变更**：所有文件操作执行完成后，在扩展端都统一调用一次 `refresh(webview)` 来发送广播消息：
   ```typescript
   webview.postMessage({
     type: MessageTypes.ON_WORKSPACES_CHANGED,
     payload: { workspaces },
   });
   ```
2. **GUI 端全量监听**：在 GUI 中，所有数据拉取 Hook（如 `useWorkspaces`、`useSessionsByWorkspace` , `useMemoryContent`）都需要对 `onWorkspacesChanged` 推送消息进行监听，并触发 `state.refetch()`，从而保证所有的列表能够全自动同步全量更新。

---

## 5. 多环境工作区自动选中与缓存切换状态管理规范

### 核心问题
在多环境运行（如官方 VS Code、派生 IDE 以及 Standalone 浏览器独立运行模式）下，前端如果默认进入首个工作区，会导致以下问题：
- 在非官方 VS Code 环境中运行时，直接默认进入某个工作区，使用户无法看到并自主选择正确的目标工作区。
- 在切换“正式版/Insiders版”等缓存重定向目标时，由于缓存数据源发生变化，若依然保留甚至默认进入某个工作区，会导致内容匹配错乱，界面无法正常反映目标环境的实际情况。

### 解决方案

1. **环境与运行上下文感知**：
   在组件初始化和渲染时，基于 `getBridgeEnvironment()` 判定当前真实运行容器是否为 `vscode` 且不为第三方 IDE（即 `showRedirectSelector === false`）。
   - **官方 VS Code 环境**：仅当当前窗口打开了具体的工程目录（即 `currentWs` 有效存在于拉取的工作区列表中时）才默认进入该工作区。不再退化到 `workspaces[0]`。
   - **非官方 VS Code 环境**：无论何种情况，默认均不进行自动选择进入，必须留空等待用户明确点选。

2. **版本切换全局置空机制**：
   在第三方 IDE 顶部下拉菜单切换 `ideRedirectTarget` 时，偏好字段发生变化后必须通过 React 状态监听机制：
   - 立即清空 `selectedWorkspace` 与 `selectedSession`。
   - 重置 `viewingWorkspaceFiles` 为 `false`。
   - 强行退回到主 `workspaces` 选择列表视图。
   这样可以保证数据源切换后，由于 `showRedirectSelector` 限制，不会触发任何默认进入的行为，页面干净地等待用户下一步输入。
