# WSL 与远程开发环境下的 VS Code 工作区路径解析指南

本文档总结了在 VS Code 扩展开发中，如何稳健地解析当前工作区与历史工作区信息，特别是针对 WSL（Windows Subsystem for Linux）和远程开发环境下文件路径不一致、配置缺失等问题的解决方案。

---

## 1. 远程开发环境判定与当前工作区修复

当 VS Code 运行在 WSL 或 SSH 等远程环境中时，部分只存在于客户端（Windows/macOS）的本地配置（如 `workspace.json`）在远程服务端的文件系统中是不可用的。这会导致依赖这些配置文件的解析器无法获取工作区的真实名称与路径。

### 1.1 远程环境判定
使用 `vscode.env.remoteName` 区分当前是否为远程环境：
- `undefined`：本地开发环境。
- `"wsl"`：WSL 远程开发环境。
- `"ssh-remote"` 等：其他远程开发环境。

### 1.2 修复活动工作区信息
对于当前正在编辑/打开的工作区，可通过 `vscode.workspace.workspaceFolders` 接口直接获取当前文件夹的信息，并根据插件上下文中的 `workspaceId` 进行合并覆盖：

```typescript
const folders = vscode.workspace.workspaceFolders;
const firstFolder = folders && folders[0];
if (currentWorkspaceId && ws.id === currentWorkspaceId && firstFolder) {
  repairedName = firstFolder.name;
  repairedPath = firstFolder.uri.fsPath;
}
```

---

## 2. WSL 环境下跨盘读取 Windows 配置

在 WSL 远程开发中，用户在 Windows 宿主机上产生的 VS Code 配置及历史记录（如 `workspaceStorage/<workspaceId>/workspace.json`）并未同步到 Linux 系统的 `workspaceStorage` 下。为获取历史工作区的信息，我们可以通过 WSL 挂载点跨盘读取 Windows 的配置文件。

### 2.1 探测 Windows 的 AppData/Roaming 路径
通常，Windows 系统中的程序路径在 WSL 下以 `/mnt/c/Users/<Username>` 挂载。我们可以利用 `process.env.PATH` 自动探测出当前 Windows 用户的挂载主目录，而无需启动昂贵的子进程去查询环境变量：

```typescript
function getWindowsAppDataRoamingInWsl(): string | undefined {
  // 从 PATH 环境变量中搜索包含 Users 的 Windows 挂载路径
  const pathParts = (process.env.PATH ?? "").split(path.delimiter);
  for (const part of pathParts) {
    const match = part.match(/^(\/[^/]+\/[^/]+\/Users\/[^/]+)/);
    if (match && match[1]) {
      const winUserHome = match[1];
      const appDataPath = path.join(winUserHome, "AppData", "Roaming");
      if (fs.existsSync(appDataPath)) {
        return appDataPath;
      }
    }
  }
  return undefined;
}
```

> **⚠️ 该探测方式的局限与 fallback**
>
> 该正则 `/^(\/[^/]+\/[^/]+\/Users\/[^/]+)/` 假设 Windows 系统挂载在标准的 `/mnt/<drive>/Users/<username>` 路径下。**以下场景会探测失败**:
> - 用户在 `/etc/wsl.conf` 中自定义了 mount 位置(如 `[automount] root = /windows/`)
> - WSL2 默认 mount root 被改成 `/run/...` 等非 `/mnt` 前缀
> - 某些精简 PATH 的容器化 WSL 环境(如 docker-desktop)PATH 中不包含 Windows 用户目录
>
> **fallback 策略**:建议在调用方加上以下兜底,若 `getWindowsAppDataRoamingInWsl()` 返回 `undefined`,则提示用户通过 `MEMORY_BOARD_WS_STORAGE_OVERRIDE` 环境变量显式指定路径(参见 `gui/vite-plugin-memory-board.ts` 中 standalone 模式的同名机制),或回退到 "无法跨盘读取 Windows 缓存" 的优雅降级提示。

### 2.2 跨盘读取 `workspace.json`
获取到 Windows 的 `AppData/Roaming` 后，拼接处 Windows 端 `workspaceStorage` 的绝对路径，并读取指定 `workspaceId` 的 `workspace.json`：

```typescript
const winJsonPath = path.join(winWorkspaceStorageDir, workspaceId, "workspace.json");
if (fs.existsSync(winJsonPath)) {
  const raw = fs.readFileSync(winJsonPath, "utf8");
  const obj = JSON.parse(raw);
  const folderUri = obj.folder ?? obj.workspace;
  // 解析 folderUri 字段...
}
```

---

## 3. 跨平台 URI 与路径转换

### 3.1 解析 `vscode-remote://` 协议
在远程或跨盘配置中，工作区目录可能被序列化为 `vscode-remote` 协议形式（例如 `vscode-remote://wsl%2Bubuntu/home/dev/project`）。我们需要提取出其真实路径：

```typescript
if (folderUri.startsWith("vscode-remote:")) {
  const url = new URL(folderUri);
  const decodedPath = decodeURIComponent(url.pathname);
  repairedPath = decodedPath; // "/home/dev/project"
  repairedName = path.basename(decodedPath);
}
```

### 3.2 转换 Windows 路径为 WSL 挂载路径
在 WSL 下读取出的本地工作区，其 `folderUri` 可能是 Windows 本地路径（如 `d:\Github\project`）。在 Linux 环境中，我们需要将其转换为 `/mnt/d/Github/project` 以便 WSL 系统正常读取和操作：

```typescript
function winPathToWsl(winPath: string): string {
  const match = winPath.match(/^([a-zA-Z]):\\(.*)$/);
  if (match && match[1] && match[2] !== undefined) {
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\\/g, "/");
    return `/mnt/${drive}/${rest}`;
  }
  return winPath;
}
```

---

## 4. 调试与排查建议

开发中应将解析出的每个工作区属性统一输出到插件专属的 `OutputChannel`，以方便在发生环境兼容问题时查看字段映射：

```typescript
export const outputChannel = vscode.window.createOutputChannel("Memory Board");
outputChannel.appendLine(`[Workspace Info] id: ${ws.id}, name: ${ws.name}, path: ${ws.path}`);
```
