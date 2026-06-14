# 响应式布局 E2E 测试指南及避坑点

在 vscode-copilot-memory-board 桌面与插件项目的 E2E 测试（基于 Playwright）中，由于引入了响应式三栏/双栏/单栏切换，部分组件会在不同的屏幕尺寸容器下渲染多个实例（通过 CSS 媒体查询隐藏非激活实例）。这种设计在进行 E2E 自动化测试时带来了若干需要特别注意的陷阱。

## 1. 响应式布局下多实例共存的 Locator 干扰

### 问题背景
在 [Layout.tsx](file:///e:/projects/vscode-copilot-memory-board/gui/src/components/Layout.tsx) 中，为了在宽屏（宽于 900px）和中屏（500px 到 899px）下切换不同的多栏视觉结构，`entryPanel`（包含 `MemoryViewer`）会在 DOM 中渲染多份（分别属于宽屏布局容器和中等屏幕容器）。
虽然非活跃容器通过 CSS `display: none`（如 `hidden min-[500px]:flex min-[900px]:hidden`）隐藏，但它们在 React 组件树和浏览器 DOM 中仍然**切实存在**。

### 带来的测试缺陷
当通过 Playwright 执行全局定位断言时（例如检测页面中某按钮的数量）：
```typescript
await expect(page.locator('[data-testid="file-preview-close"]')).toHaveCount(0);
```
该 Locator 会在全局 DOM 中进行匹配，导致将隐藏在非活跃副本中的元素也统计进去。即使当前视口中该元素已被完全销毁，隐藏的副本中可能仍旧存在该元素（因为局部状态 `selectedNode` 仅在被点击的活跃实例中更新了，未在隐藏副本中同步），导致断言数值非 0 而失败。

### 解决方案
- **限定父容器范围**：对于全局存在多个副本的测试断言，必须将定位器限定在当前活跃的容器选择器中。
  例如，在桌面测试中，应该限定在宽屏布局容器 `.min-[900px]:flex` 中：
  ```typescript
  // 限定在宽屏作用域下，过滤掉中屏和窄屏隐藏副本中的元素
  await expect(page.locator('.min-\\[900px\\]\\:flex [data-testid="file-preview-close"]')).toHaveCount(0);
  ```

---

## 2. 浏览器沙箱执行回调中的 Function 包装缺陷

### 问题背景
为了避开窄屏/中屏同步渲染的副本，测试脚本 [memory-board.spec.ts](file:///e:/projects/vscode-copilot-memory-board/e2e/memory-board.spec.ts) 中定义了辅助方法 `inWideScope`：
```typescript
async function inWideScope(page: Page, fn: (scope: HTMLElement) => void) {
  await page.evaluate(async (cbSrc) => {
    const el = document.querySelector<HTMLElement>(".min-\\[900px\\]\\:flex");
    ...
    const cb = new Function("scope", cbSrc);
    await cb(el);
  }, fn.toString());
}
```

### 带来的测试缺陷
当传入的 `fn` 是箭头函数时，`fn.toString()` 输出为 `"(scope) => { ... }"`。
如果直接执行 `new Function("scope", "(scope) => { ... }")`，其在浏览器中生成的函数结构为：
```javascript
function anonymous(scope) {
  (scope) => { ... } // 仅仅声明了箭头函数，没有返回也没有调用！
}
```
这导致在 `inWideScope` 中传入的实际点击/查询逻辑**根本没有执行**，默默地成功返回而没有实际操作。

### 解决方案
- **利用立即执行函数 (IIFE) 包装**：在 `new Function` 拼接时，将箭头函数源码作为立即执行表达式（IIFE）包装起来执行：
  ```typescript
  // 确保传入的箭头函数在 Function 体内被立即执行并传入参数
  const cb = new Function("scope", "return (" + cbSrc + ")(scope)");
  ```
  通过此项修复，传入的 click() 事件和 element 查询等核心逻辑得以在真实的浏览器 DOM 中得到正确触发。
