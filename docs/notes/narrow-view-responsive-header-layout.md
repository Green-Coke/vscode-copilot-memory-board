# 窄屏响应式头部与操作栏合并指南

本指南总结了在开发 Memory Board 插件的 Webview GUI 时，针对 VS Code 侧边栏及极窄宽度屏幕（宽度 < 500px）下的顶部导航返回条与操作控件（如会话排序）合并的技术细节与 API 实践。

---

## 1. 核心问题

在 VS Code 侧边栏等宽度受限的窄屏环境（如小于 500px）下，如果导航与操作栏（例如排序、搜索等）各占一整行，会导致：
1. **严重的垂直空间浪费**：在侧边栏等狭窄的视图中，每一个像素的垂直空间都弥足珍贵。两行非必要占位会导致主内容区域极其局促。
2. **视觉失衡**：在窄屏下，返回箭头和工作区名称只占了左侧一小部分，右侧大片空白；而原本在会话列表顶部的排序控件也是在右侧，左侧留白过多。两行上下错落，观感不够连贯协调。

---

## 2. 解决方案

通过**操作栏传递与响应式条件隐藏（Responsive Hiding）**机制，将两行界面元素优雅地合并为一行：

### 2.1 增加 `NarrowHeader` 的动作卡槽（Action Slot）

在窄屏导航栏组件 `NarrowHeader` 的动作卡槽实现中（对应 `gui/src/components/Layout.tsx`）,定义如下接口(已校对与实际源码一致):

```tsx
interface NarrowHeaderProps {
  /** 当前视图模式(决定标题文案与后退行为) */
  currentView: ViewMode;
  /** 当前选中的工作区(用于显示标题);未选中时为 null */
  title: string;
  /** 后退到工作区列表的回调 */
  onBackToWorkspaces?: () => void;
  /** 后退到会话列表的回调 */
  onBackToSessions?: () => void;
  /** 当前是否正处于工作区级目录视图 */
  viewingWorkspaceFiles?: boolean;
  /** 右侧的自定义操作按钮或组件（如窄屏下的排序控件），以实现两行合并为一行 */
  action?: ReactNode;
}
```

并在 `NarrowHeader` 的 JSX 结构中使用 `flex justify-between` 布局，左边渲染后退及标题，右边按需渲染 `action`：

```tsx
function NarrowHeader({
  currentView,
  title,
  onBackToWorkspaces,
  onBackToSessions,
  viewingWorkspaceFiles = false,
  action,
}: NarrowHeaderProps) {
  // ...
  return (
    <nav className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border-default bg-surface-1/80 backdrop-blur-md z-20 relative min-h-[40px] shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={handleBack} ... >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-bold text-text-primary truncate font-display">
          {title}
        </span>
      </div>
      {action && (
        <div className="flex items-center shrink-0 select-none">
          {action}
        </div>
      )}
    </nav>
  );
}
```

> [!NOTE]
> **本节已修订(2026-06-20)**:旧版文档中 `NarrowHeaderProps` 误列了 `selectedWorkspace: any` 与 `selectedSession: any` 两个字段,实际项目源码 `gui/src/components/Layout.tsx` **没有**这两个字段(改为更简洁的 `title: string` 直接传入解析好的标题)。按旧文档实现会产生 TypeScript 类型不匹配。本修订已与源码对齐。

### 2.2 响应式隐藏原本独占一行的操作栏

在会话列表组件 `SessionList.tsx` 中，对原本顶部的 `SortControl` 容器引入 Tailwind / Vanilla CSS 媒体查询：
在中屏及宽屏模式下正常显示（`min-[500px]:flex`），而在窄屏模式下直接隐藏（`hidden`）：

```tsx
{/* 排序控件：在窄屏单栏模式下合并到 NarrowHeader 渲染以节省空间，非窄屏时在此处显示 */}
<div className="flex items-center justify-end px-3 pt-3 pb-2 border-b border-border-subtle bg-surface-1/10 min-[500px]:flex hidden">
  <SortControl
    value={sortOption}
    onChange={onSortChange}
    testIdScope="session"
  />
</div>
```

### 2.3 状态与组件在 `Layout` 与 `App` 的编排

1. **`LayoutProps` 增加 `sessionSortAction` 接口**，并在窄屏下将该 Action 动态绑定给 `NarrowHeader`：
   ```tsx
   action={currentView === "sessions" ? sessionSortAction : undefined}
   ```
2. **在 `App.tsx` 的调用点实例化 `SortControl`**，并将其作为 `sessionSortAction` 属性传入 `AdaptiveLayout`：
   ```tsx
   sessionSortAction={
     <SortControl
       value={workspaceState.sessionSort}
       onChange={(next) => updateWorkspaceState({ sessionSort: next })}
       testIdScope="session"
     />
   }
   ```

---

## 3. 结果与优势

1. **零功能损失**：排序机制和持久化状态在窄屏模式下依然完全可用。
2. **极佳的视觉紧凑感**：成功将原本占据两行的导航与排序合并到同一行，VS Code 侧边栏的可用内容高度增加了约 36px。
3. **完全的响应式支持**：在中屏/宽屏和窄屏之间无缝过渡，不需要进行手动的事件处理或 resize 监听，纯 CSS 隐藏配合 React 插槽即可轻松实现。
