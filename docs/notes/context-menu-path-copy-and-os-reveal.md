# 右键菜单路径复制与在资源管理器中打开 (API 使用指南)

在开发基于 VS Code Webview 的应用时，常需要提供类似于 VS Code 原生的右键菜单功能（如“复制物理路径”和“在资源管理器中打开”）。本文档总结了在 `Memory Board` 项目中通过 Radix UI 结合 VS Code Extension Bridge 实现这些功能的开发方法。

---

## 1. Webview 端的右键菜单组件实现 (React)

我们采用了 Radix UI 的 `@radix-ui/react-context-menu` 作为上下文菜单的基础组件，它的优势在于能够完美处理菜单的位置计算、按键焦点导航以及屏幕溢出等问题，且易于使用 CSS (Tailwind/Vanilla) 进行高度定制。

### 代码模版与关键逻辑

在列表条目（如工作区项、会话项等）外部包裹 `ContextMenu.Root` 和 `ContextMenu.Trigger`：

```tsx
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Link, FolderOpen } from "lucide-react";
import { useCopyPath, useRevealInOs } from "@/hooks/use-bridge";

export function ItemComponent({ item }) {
  const copyPath = useCopyPath();
  const revealInOs = useRevealInOs();

  const handleCopyPath = async (e: Event) => {
    e.stopPropagation();
    if (item.path) {
      await copyPath(item.path, false);
    }
  };

  const handleRevealInOs = async (e: Event) => {
    e.stopPropagation();
    if (item.path) {
      await revealInOs(item.path);
    }
  };

  return (
    <ContextMenu.Root>
      {/* 1. 触发区域 */}
      <ContextMenu.Trigger asChild>
        <div className="item-trigger" onClick={handleSelect}>
          {item.name}
        </div>
      </ContextMenu.Trigger>

      {/* 2. 菜单悬浮层 */}
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[180px] bg-surface-1 rounded-lg border shadow-lg p-1.5 z-[9999]">
          <ContextMenu.Item
            disabled={!item.path}
            onSelect={handleCopyPath}
            className="flex items-center gap-3 px-4 py-1.5 text-xs rounded-sm cursor-pointer hover:bg-surface-3"
          >
            <Link className="w-3.5 h-3.5" />
            <span>复制路径</span>
          </ContextMenu.Item>
          
          <ContextMenu.Item
            disabled={!item.path}
            onSelect={handleRevealInOs}
            className="flex items-center gap-3 px-4 py-1.5 text-xs rounded-sm cursor-pointer hover:bg-surface-3"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>在资源管理器中打开</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
```

> [!IMPORTANT]
> **事件冒泡处理**：Radix 的 `onSelect` 在执行时并不会在 DOM 树中向上冒泡，因为 Portal 会把菜单挂载到 `body` 根节点下。但是在右键点击时需要注意触发层自身的选中状态（如触发 `onClick`），我们在自定义的动作处理器中使用 `e.stopPropagation()` 保护防止其它副作用。

---

## 2. VS Code 宿主端 API (Extension API)

Webview 自身受到沙箱限制，无法直接访问操作系统的剪贴板 and 执行系统命令，必须通过 `postMessage` 通信将请求发送至 VS Code 扩展端去调用 VS Code API 执行。

### 2.1 复制绝对路径到系统剪贴板
VS Code 提供了 `vscode.env.clipboard` 对象，用于跨平台安全地读写剪贴板。

- **写入路径 API**：
  ```typescript
  await vscode.env.clipboard.writeText(filePath);
  ```

### 2.2 在系统资源管理器中打开目录/文件 (OS Reveal)
VS Code 提供了内置命令 `revealFileInOS`，能够直接唤起操作系统的文件管理器（如 Windows 资源管理器、macOS Finder），并将对应的文件或文件夹高亮选中显示。

- **调用内置命令**：
  ```typescript
  // 必须将绝对路径转化为 vscode.Uri
  await vscode.commands.executeCommand(
    "revealFileInOS",
    vscode.Uri.file(revealPath)
  );
  ```

---

## 3. Node.js 端的 file:// 路径解析避坑指南

由于 VS Code 导出的工作区文件夹配置使用的是 `file://` 协议的 URI（例如 `file:///e%3A/projects/vscode-copilot-memory-board`），在 Node.js 端将其转换成本地文件系统路径时有以下要点：

1. **URL 编码解码**：
   在 URL 解析后得到的 `parsed.pathname` 中，Windows 盘符冒号会被编码为 `%3A`。如果直接处理，会导致得到的物理路径中包含 `%3A`（例如 `e%3A\projects\foo`），这将使得 `vscode.Uri.file()` 或 `fs.existsSync` 抛错，或者导致资源管理器无法定位。
   
2. **正确转换方法**：
   在提取 `pathname` 后，必须使用 `decodeURIComponent()` 进行 URL 字符解码。

   ```typescript
   export function uriToFsPath(uri: string): string {
     if (!uri.startsWith("file:")) {
       return "";
     }
     let parsed: URL;
     try {
       parsed = new URL(uri);
     } catch {
       return "";
     }
     // 1. 必须进行解码得到 e:/projects/...
     const pathname = decodeURIComponent(parsed.pathname);
     
     // 2. Windows 盘符路径开头会带一个斜杠 (如 "/e:/...")，需要把开头的斜杠截取掉
     const isWinDrive = /^\/[a-zA-Z]:/.test(pathname);
     const fsPath = isWinDrive ? pathname.slice(1) : pathname;
     
     // 3. 将正斜杠统一转换为符合当前系统的路径分隔符 (Windows: \, POSIX: /)
     return fsPath.replace(/\//g, path.sep);
   }
   ```

---

## 4. 工作区存储路径 (Workspace Storage) 的解析与集成

在右键菜单中支持“复制/打开工作区存储路径”时，我们需要通过以下步骤获取并展示 workspaceStorage 物理绝对路径：

### 4.1 接口扩展
在 `Workspace` 接口中，添加可选字段 `storagePath`：
```typescript
export interface Workspace {
  // ... 其他属性
  /**
   * 该工作区在本地对应的 workspaceStorage 目录的物理绝对路径（可选）。
   */
  storagePath?: string;
}
```

### 4.2 路径的解析与填充
解析器（`MemoryParser`）在扫描工作区时，利用 `basePath`（即 `workspaceStorage` 的根目录路径）与工作区的 `workspaceId` 进行拼接，动态得出 `storagePath`：
```typescript
// core/src/memory-parser.ts
storagePath: path.join(this.basePath, workspaceId)
```

### 4.3 前端 (WorkspaceList) 菜单细化
在 `WorkspaceList` 的 React 右键菜单组件中，菜单项被明确细分为两组，以 Separator 分隔：
- **路径复制组**：
  - “复制项目路径”：复制 `workspace.path`。
  - “复制存储路径”：复制 `workspace.storagePath`。
- **系统资源管理器打开组**：
  - “在资源管理器中打开项目”：通过 bridge 触发 `revealInOs` 打开 `workspace.path`。
  - “在资源管理器中打开存储目录”：通过 bridge 触发 `revealInOs` 打开 `workspace.storagePath`。

```tsx
<ContextMenu.Content>
  <ContextMenu.Item disabled={!workspace.path} onSelect={handleCopyPath}>
    <Link />
    <span>复制项目路径</span>
  </ContextMenu.Item>
  <ContextMenu.Item disabled={!workspace.storagePath} onSelect={handleCopyStoragePath}>
    <Link />
    <span>复制存储路径</span>
  </ContextMenu.Item>
  
  <ContextMenu.Separator className="h-px bg-border-subtle/40 my-1 mx-2" />

  <ContextMenu.Item disabled={!workspace.path} onSelect={handleRevealInOs}>
    <FolderOpen />
    <span>在资源管理器中打开项目</span>
  </ContextMenu.Item>
  <ContextMenu.Item disabled={!workspace.storagePath} onSelect={handleRevealStorageInOs}>
    <FolderOpen />
    <span>在资源管理器中打开存储目录</span>
  </ContextMenu.Item>
</ContextMenu.Content>
```

### 4.4 目录直接打开与复制行为的优化（宿主端处理）
由于操作系统的文件管理器调用（如 VS Code 的 `revealFileInOS`）如果接受目录路径，通常只能在父目录中将该目录“选中/高亮”，而不能“直接进入/打开”该目录。

为了解决该体验问题，VS Code 宿主端在处理 `REVEAL_IN_OS` 和 `COPY_PATH_TO_CLIPBOARD` 时进行了精细化适配：
1. **类型判断**：检测传入路径是否为物理目录。
2. **定位至 `workspace.json`**：如果该目录下存在 `workspace.json`，则在调用 `revealFileInOS` 与剪贴板写入时，自动将物理路径替换为指向 `workspace.json` 的完整文件路径。
3. **效果**：资源管理器直接进入了该工作区存储目录，并高亮了 `workspace.json`，用户能够直接查看或复制工作区缓存细节。
