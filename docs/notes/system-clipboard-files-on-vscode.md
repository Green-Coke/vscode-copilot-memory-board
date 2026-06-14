# 系统剪贴板文件读取：VS Code 扩展的限制与变通方案

## 核心问题

> 为什么 VS Code 自身的资源管理器能粘贴文件，而第三方扩展不行？

### VS Code 内置资源管理器的特权通道

VS Code 内置的资源管理器（Explorer）可以粘贴从系统资源管理器复制的文件，
这是因为它走的是 **Electron / 原生 C++ 代码通道**：

- Electron 的 `clipboard.readBuffer('CF_HDROP')` 可以直接读取 Windows 剪贴板中的
  CF_HDROP（文件拖放列表）二进制格式
- macOS 上通过 `NSFilenamesPboardType` 读取文件路径列表
- 这些都是 Electron 底层暴露的能力，**第三方扩展完全无法访问**

### 第三方扩展的限制

VS Code 对第三方扩展只暴露了 `vscode.env.clipboard` API，
而这个 API **仅包含 `readText()` 和 `writeText()` 两个方法**：

```typescript
// VS Code API 定义
namespace vscode.env {
  export const clipboard: {
    readText(): Thenable<string>;
    writeText(value: string): Thenable<void>;
  };
}
```

当用户在系统资源管理器中"复制"文件时，系统剪贴板中存储的是：
- **Windows**: CF_HDROP 格式（二进制，文件路径列表）
- **macOS**: NSFilenamesPboardType（plist 格式）
- **Linux**: text/uri-list 或 x-special/gnome-copied-files

这些都是**非纯文本格式**，`readText()` 读不到有意义的内容。

## 变通方案：child_process 调用平台命令

### Windows（已实现）

通过 `child_process.spawn` 调用 PowerShell 命令读取剪贴板：

```typescript
spawn('powershell.exe', [
  '-NoProfile',
  '-Command',
  'Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }'
]);
```

- `Get-Clipboard -Format FileDropList`：读取 CF_HDROP 格式数据
- PowerShell 随 Windows 系统 100% 覆盖，是最稳定的方案
- 输出每行一个文件绝对路径

### macOS（待实现）

macOS 需要通过 `osascript` 或自定义 Swift helper 来读取：

```bash
# 方案 1: osascript（但解析 plist 比较繁琐）
osascript -e 'the clipboard as «class furl»'

# 方案 2: pbpaste + Swift helper（更可靠但需要编译）
```

本次开发中 macOS 暂不支持，用户需要改用拖拽方式导入。

### Linux（不支持）

Linux 的剪贴板系统（X11/Wayland）差异较大，暂不支持。

## Memory Board 的两条导入途径

| 方式 | 平台支持 | 技术实现 | 使用场景 |
|------|----------|----------|----------|
| **拖拽导入** | 全平台 | HTML5 DataTransfer | 从桌面拖文件到 Memory Board |
| **Ctrl+V 粘贴** | 仅 Windows | PowerShell child_process | 资源管理器复制 → Memory Board 粘贴 |

## 工程取舍

### 内部复制/剪切会覆盖外部剪贴板

当用户在 Memory Board 内执行"复制"操作时，会通过 `vscode.env.clipboard.writeText()` 
写入 JSON 协议化路径字符串：

```json
{"v":1,"op":"copy","paths":["/path/to/file.md"]}
```

这会**覆盖**系统剪贴板中原有的 CF_HDROP 数据。
这是一个经过评估的工程取舍——保证内部操作的一致性优先。

## 未来改进

- **Electron 单体应用**：如果 Memory Board 未来作为 Electron 独立应用发布，
  可以直接使用 `clipboard.readBuffer('CF_HDROP')` 读取剪贴板，比 spawn 子进程更优雅
- **macOS 支持**：使用 `osascript` + Swift helper 实现
