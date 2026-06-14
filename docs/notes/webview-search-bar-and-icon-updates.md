# Webview 响应式搜索栏与自适应插件图标更新指南

本文档总结了在 VS Code 插件开发中，关于插件自定义 SVG 图标的设计规范以及 Webview 中响应式弹性容器内搜索栏布局塌陷问题的排查与解决方法。

---

## 一、 自适应插件图标更新设计 (VS Code Activity Bar / Panel Icon)

### 1. 核心需求
将 VS Code 侧边栏/底部面板的默认插件图标替换为品牌专用的神经网络图标（脑部连线图样）。

### 2. 设计规范与适配
- **命名空间**: 独立 SVG 文件必须添加 `xmlns="http://www.w3.org/2000/svg"` 属性。
- **线条粗细 (stroke-width)**: 
  - 原版界面顶部的 Logo 由于自带外发光和特定的尺寸大小，使用的是 `stroke-width="1.5"`。
  - 在 VS Code 侧边栏活动条中渲染时，图标容器通常较小（约 `24px ~ 28px`），且没有环境光晕效果。为保证图标的清晰、锐利与高辨识度，应选用更符合 VS Code 默认线条感的粗细。最终本图标设定在 `viewBox="0 0 100 100"` 下选用 `stroke-width="5"`（折算至 `24px` 级别约为 `1.2px`），取得了极佳的视觉平衡。
- **主题自适应色 (Theme Adaptive Colors)**: 
  - 核心连线、骨架及边缘普通节点全部使用 `currentColor` 作为描边/填充色，以便 VS Code 自动根据当前主题色（如 Dark/Light/High Contrast）切换展示前景色。
  - 神经网络最核心的三枚特征节点则保留原有的静态马卡龙配色（分别为天青色 `#0284c7`、粉紫色 `#c084fc`、蜜桃粉 `#fb7185`），并且显式设置 `stroke="none"` 防止继承全局描边，保持独有的品牌辨识度。

### 3. 配置参考 (`package.json`)
```json
"viewsContainers": {
  "activitybar": [
    {
      "id": "memory-board-sidebar",
      "title": "Memory Board",
      "icon": "resources/icon.svg"
    }
  ]
}
```

---

## 二、 响应式搜索栏布局塌陷排查与修复 (Webview Responsive Search Layout)

### 1. 现象分析
在窄屏（如 VS Code 侧栏单栏）模式下，原搜索栏被挤压得非常短，且左侧有大片无意义的空白区域。

### 2. 原因排查
搜索栏布局结构如下：
```tsx
<div className="pl-4 pr-3 py-3 border-b border-border-default bg-surface-1/10 flex justify-end gap-3 select-none">
  <div className="flex items-center gap-3">
    <div className="relative flex items-center w-full sm:w-[200px]">
      <input className="cyber-input w-full ..." />
    </div>
  </div>
</div>
```
- 父层级具有 `flex justify-end`，这会让子项向右对齐。
- 中间层 `div className="flex items-center gap-3"` **没有设置宽度宽度约束**，采用默认的 `width: auto`。
- 内部搜索框容器被赋予了 `w-full`（在移动端或窄屏下生效）。
- **CSS 规范中，在具有 `flex` 且不指定宽度的容器下，子元素 `w-full` 会因为父级无法隐式计算百分比宽度而退化，并被 `flex-shrink` 挤压至其内容的最小宽度**，导致最终搜索输入框严重缩窄。

### 3. 解决方案
通过将中间层容器显式补充 `w-full justify-end`，并对内部搜索框容器使用更小粒度的响应式断点控制解决：
```tsx
<div className="pl-4 pr-3 py-3 border-b border-border-default bg-surface-1/10 flex justify-end gap-3 select-none">
  {/* 补充 w-full 撑满全宽，并通过 justify-end 将子元素向右排列 */}
  <div className="flex items-center gap-3 w-full justify-end">
    {/* 在窄屏 (单栏 / <500px) 下，w-full 撑满剩余全部可用空间；宽屏 (>=500px) 下，恢复固定 w-[200px] */}
    <div className="relative flex items-center w-full min-[500px]:w-[200px]">
      <input className="cyber-input w-full ..." />
    </div>
  </div>
</div>
```

通过这一调整：
1. 在 VS Code 侧边栏（单栏模式）中，搜索栏能自动拉伸占据整个行宽度，大大提升输入操作的便利性。
2. 在大宽屏（三栏/双栏模式）下，依然保持右对齐且限定在 `200px` 的精致身形。
