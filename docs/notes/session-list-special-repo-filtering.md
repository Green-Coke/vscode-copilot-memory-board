# 特殊的“工作区级目录”会话过滤指南

## 核心设计与背景

在 Memory Board 中，用户除了可以查看和管理具体的会话（Sessions，即每一次的聊天时间线）外，还可以直接查看和编辑当前工作区共享的**工作区级目录**（对应 `memories/repo` 子目录下的记忆文件）。

### 后端解析模型

后端核心组件 `MemoryParser` 在扫描某个工作区的所有会话时，会扫描 `memories` 目录下的所有子目录：
- 子目录名为 `repo` 时：将其包装成一个特殊的**工作区级会话**并返回：
  - `id`: `DEFAULT_SESSION_IDS.REPO` (常量值为 `"_repo_"`)
  - `isRepo`: `true`
  - `title`: `"工作区级目录"`
- 子目录为其他 Base64 编码的会话 UUID 时：解析为普通会话。

```typescript
// core/src/memory-parser.ts 中的解析逻辑
if (entry.name === "repo") {
  sessions.push({
    id: DEFAULT_SESSION_IDS.REPO,
    workspaceId,
    title: "工作区级目录",
    createdAt: stat ? toIso(stat.birthtime ?? stat.ctime) : new Date(0).toISOString(),
    entryCount,
    isRepo: true,
  });
  continue;
}
```

---

## 前端 UI 重复展示问题与过滤策略

### 顶部独立入口

在前端 GUI 的 `SessionList` 组件中，工作区级目录入口被设计为一个**独立分区渲染的顶部按钮**，该按钮伴随专属的树形图标（`FolderTree`）和状态展示：

```tsx
// gui/src/components/SessionList.tsx
{onSelectWorkspaceFiles && (
  <div className="px-2.5 pt-2.5">
    <button onClick={onSelectWorkspaceFiles} ...>
      工作区级目录
    </button>
  </div>
)}
```

### 列表重复过滤

由于 `sessions` 接口包含此特殊会话，如果不加处理，它也会被作为普通的会话列表项渲染在下方的会话时间轴中，从而导致界面出现**两个“工作区级目录”入口**。

为了保持界面一致性并剔除重复项，我们在 `SessionList` 中计算 `pinned`（钉选）和 `unpinned`（未钉选）列表的 `useMemo` 过滤器里，**主动剔除了所有 `session.isRepo === true` 的会话**：

```tsx
// gui/src/components/SessionList.tsx
const { pinned, unpinned } = useMemo(() => {
  const filtered = sessions.filter((session) =>
    // 过滤掉特殊的 repo 工作区级目录 session，因为该入口已单独在列表最上方作为独立分区渲染
    !session.isRepo &&
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  // 后续排序和钉选逻辑...
}, [sessions, searchQuery, sortOption, pinnedIds]);
```

这样既保留了顶部专有且美观的“工作区级目录”快捷入口，又保证了下方的会话列表（Sessions）全为真实的聊天会话。
