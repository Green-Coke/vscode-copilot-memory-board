# Radix UI ContextMenu 视口边缘碰撞与遮挡优化指南

本指南总结了在 VS Code Webview 侧栏或窄屏单栏模式下，右键上下文菜单（ContextMenu）因贴近视口边缘而发生遮挡与裁剪问题的现象、成因及解决方案，以供后续开发参考。

## 1. 问题现象与表现

在 VS Code 侧栏或极窄 viewport（如小于 500px 的单栏模式）中，用户在靠近左侧边缘的节点上右键点击时，右键上下文菜单弹出后：
- 菜单的左边框和左圆角消失；
- 菜单项最左侧的 Lucide 图标被切掉一半至三分之二，导致无法完整呈现；
- 菜单在视觉上呈现出“被左侧边栏/宿主窗口遮挡”的生硬裁剪效果。

## 2. 根本原因分析

1. **Webview Iframe 裁剪限制**：VS Code 的 Webview 运行在一个高度受限的 `iframe` 容器中。该容器及其外层元素具有 `overflow: hidden` 的裁剪限制。虽然 Radix UI 的 `<ContextMenu.Portal>` 将菜单内容渲染在 `document.body` 中，但它仍然无法超出当前 Webview 的 Iframe 视口。
2. **默认碰撞边距为 0**：Radix UI 的 `<ContextMenu.Content>` 在定位时默认使用的 `collisionPadding`（碰撞填充边距）为 `0`。这意味着当右键触发点的 `clientX` 极小时，菜单的定位算法会使菜单的左边缘紧贴 `left: 0` 像素点。而由于菜单的阴影、外部描边边框以及内部菜单项的前置 padding，这部分额外的像素会超出 `0` 像素线，从而超出 Webview 视口左侧，直接被外层容器裁剪掉。

## 3. 解决方案

为了从底层修复此遮挡现象，我们需要使用 Radix UI 提供的位置碰撞避让机制。

在所有声明 `<ContextMenu.Content>` 的地方，显示声明 `collisionPadding` 属性，设置其为合理的值（推荐为 `10`）：

```tsx
<ContextMenu.Content
  /* 设置 collisionPadding 防止靠边点击时菜单被视口边缘遮挡 */
  collisionPadding={10}
  className={cn(
    "min-w-[180px] py-1.5 px-1.5",
    "rounded-lg border border-border-default/60",
    "bg-surface-1/95 backdrop-blur-md",
    "shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
    "z-[9999]",
    "animate-in fade-in-0 zoom-in-95 duration-100"
  )}
>
  {/* 菜单项 */}
</ContextMenu.Content>
```

### 属性详解
- **`collisionPadding={10}`**：该属性通知 Radix UI 的定位引擎，在计算菜单渲染位置时，菜单边界与 viewport（视口）的左、右、上、下边缘之间必须保留至少 `10px` 的缓冲边距。
- **效果**：如果用户的右键点击点非常靠左，导致菜单本来应该渲染在 `left: 2px`，定位引擎会强制将菜单水平向右推移，定位在 `left: 10px`。这 10px 的安全区不仅完美保护了菜单的图标和左边框，还完整展示了柔和的投影，界面美感得以完整保留。

## 4. 已覆盖和应用的场景

此优化已经应用在以下几个主上下文菜单的组件中：
1. **[FileTreeContextMenu](file:///e:/projects/vscode-copilot-memory-board/gui/src/components/FileTreeContextMenu.tsx)**：优化了文件树中对文件/文件夹节点进行右键操作的定位。
2. **[WorkspaceList](file:///e:/projects/vscode-copilot-memory-board/gui/src/components/WorkspaceList.tsx)**：优化了主面板工作区列表项上的右键操作。
3. **[SessionList](file:///e:/projects/vscode-copilot-memory-board/gui/src/components/SessionList.tsx)**：优化了“工作区级目录”快捷按钮项以及普通的“会话（Session）”列表项上的右键定位。

在后续如果有新增的 `<ContextMenu>`、`<DropdownMenu>` 或 `<Popover>` 浮层，应当同样注意显式配置 `collisionPadding` 属性，以维持一致的高品质防裁剪交互体验。
