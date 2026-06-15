# 列表过滤与前端分页功能设计与使用指南

本指南主要总结了工作区列表 (`WorkspaceList`) 和会话列表 (`SessionList`) 引入的**过滤功能**（只展示有记忆的工作区 / 只展示有条目的会话）以及**前端分页加载功能**（Pinned 钉选全展 + Unpinned 每次加载 5 条）的设计架构、实现链路及后续开发维护参考。

---

## 1. 架构设计与状态持久化

所有的过滤条件状态都会被持久化到工作区状态中，支持跨会话与 webview 重启的自动恢复。

### 1.1 数据结构定义
过滤状态扩展在 `core/src/types.ts` 中的 `WorkspaceState` 接口下：

```typescript
export interface WorkspaceState {
  // ... 其他已有状态
  /** 仅展示有记忆的工作区（过滤 sessionCount === 0 的项） */
  onlyShowWithMemories: boolean;
  /** 仅展示有条目的会话（过滤 entryCount === 0 的项） */
  onlyShowWithEntries: boolean;
}
```

默认状态 `DEFAULT_WORKSPACE_STATE` 已做相应扩展：
- `onlyShowWithMemories: false`
- `onlyShowWithEntries: false`

### 1.2 前端持久化桥接
持久化字段在 `gui/src/hooks/use-bridge.ts` 与 `gui/src/lib/bridge.ts` 的辅助函数中同步更新：
- **`cloneDefaultWorkspace` / `cloneDefaultWorkspaceState`**：深拷贝时同步拷贝这两个过滤状态字段，防止遗漏。
- **`mergeWorkspace` / `mergePartialWorkspaceState`**：执行 Patch 合并时通过 `??` 操作符回退到默认值。

在第三方 IDE 重定向模式下切换扫描目标时，`App.tsx` 中的 `useEffect` 会自动清理所有局部工作区选择状态，但过滤状态属于全局/工作区状态，仍将安全地合并保存。

---

## 2. 通用过滤组件 `FilterDropdown`

我们基于 `@radix-ui/react-dropdown-menu` 抽象了通用的过滤组件 `FilterDropdown.tsx`（位于 [FilterDropdown.tsx](file:///e:/projects/vscode-copilot-memory-board/gui/src/components/FilterDropdown.tsx)），它具备以下特点：
- **Cyber 风格 Trigger 按钮**：高亮边框和发光点（Dot Indicator）提示当前过滤是否激活。
- **毛玻璃效果 Content**：融合项目本身的 `.glass-panel` 设计，带有 `backdrop-blur` 和 `bg-surface-1/95` 样式。
- **受控状态**：接收 `checked` 与 `onToggle` 进行状态改变。
- **重置功能**：内置一个“重置过滤”按钮，在过滤未启用时为置灰不可用状态。

### 2.1 组件 Props
```typescript
interface FilterDropdownProps {
  /** 主选项文案，例如 "只展示有记忆的工作区" */
  label: string;
  /** 当前过滤是否启用 */
  checked: boolean;
  /** 切换过滤的回调 */
  onToggle: (next: boolean) => void;
  /** 用于 data-testid 稳定锚点的标识 */
  testIdScope?: string;
}
```

---

## 3. 过滤与分页切片逻辑

分页机制**仅对非钉选项目（Unpinned）生效**，已被钉选（Pinned）的项目始终会全部展开，不计入截断数量内。

### 3.1 核心算法实现

在组件内部通过 `useMemo` 计算过滤和分组，并通过 `useState` 跟踪分页展示数量 `visibleCount`：

```typescript
// 1. 计算过滤、排序与钉选分组
const { pinned, unpinned } = useMemo(() => {
  // 关键字过滤
  let filtered = items.filter(item => item.name.includes(searchQuery));
  
  // 条件过滤条件
  if (onlyShow) {
    filtered = filtered.filter(item => item.count > 0);
  }
  
  // 排序
  const sorted = sortItems(filtered, sortOption);
  
  return {
    pinned: sorted.filter(item => pinnedIds.includes(item.id)),
    unpinned: sorted.filter(item => !pinnedIds.includes(item.id))
  };
}, [items, searchQuery, sortOption, pinnedIds, onlyShow]);

// 2. 对非钉选组分页截断，钉选组全展
const visibleUnpinned = useMemo(() => {
  return unpinned.slice(0, visibleCount);
}, [unpinned, visibleCount]);

const hasMore = unpinned.length > visibleCount;
```

### 3.2 自动重置策略
为保持用户交互体验一致，当用户进行**搜索输入、改变排序规则、切换过滤开关**时，分页数量会自动重置回默认的 5 项：

```typescript
const [visibleCount, setVisibleCount] = useState(5);

useEffect(() => {
  setVisibleCount(5);
}, [searchQuery, sortOption, onlyShow]);
```

### 3.3 Load More 按钮样式
底部“加载更多”按钮融合了霓虹发光与渐变风格：
```tsx
{hasMore && (
  <button
    data-testid="load-more-xxx"
    onClick={() => setVisibleCount(c => c + 5)}
    className="w-full py-2 px-4 mt-1 rounded-lg text-center font-mono text-[10px] font-bold tracking-wider transition-all duration-300 bg-gradient-to-r from-brand-indigo/10 to-brand-purple/10 border border-brand-indigo/35 text-brand-indigo hover:text-brand-indigo/90 shadow-[0_0_8px_rgba(99,102,241,0.1)]"
  >
    加载更多（剩余 {unpinned.length - visibleCount} 项）
  </button>
)}
```

---

## 4. 后续维护与开发提示

1. **特殊 Session 处理**：
   在 `SessionList.tsx` 中，`isRepo`（工作区级目录）是一个特殊的顶级入口，该入口不参与钉选、过滤和前端分页，始终固定在列表顶层。
2. **新增列表扩展**：
   如果以后需要引入新的分组（如归档列表），需要遵循“只对未钉选项目做 Slice，且搜索、排序改变时重置分页”的规则。
3. **E2E 断言**：
   Playwright 测试中，定位列表元素时尽量使用 `[data-testid^="workspace-item-"]` 等前缀匹配，并配合 `first()` 定位，避免因分页导致特定索引的项未被渲染而导致断言失败。
