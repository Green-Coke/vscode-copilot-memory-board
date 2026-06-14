# VS Code API 功能使用指南：Copilot Memory 文件加载

本文档总结了在 VS Code 扩展（Extension）开发中，如何通过本地文件系统加载 GitHub Copilot Chat 写入的记忆文件，以及与之相关的 VS Code API 和数据格式。

---

## 1. workspaceId 的 MD5 生成机制

VS Code 使用 `workspaceStorage/<workspaceId>/` 目录结构为每个工作区维护独立的持久数据。workspaceId 是对工作区路径的 **MD5 哈希**（32 位十六进制字符串）。

**算法来源**：`src/vs/platform/workspaces/node/workspaces.ts`

```typescript
// 核心逻辑
function getWorkspaceId(configPath: string): string {
  let configPathStr = configPath;
  // Windows/macOS：路径先转小写再哈希
  if (!isLinux) {
    configPathStr = configPathStr.toLowerCase();
  }
  return createHash('md5').update(configPathStr).digest('hex');
}
```

**平台差异**：
- Windows / macOS：路径先转小写，再 MD5
- Linux：保持原始大小写，直接 MD5

**识别方式**：workspaceStorage 目录下的子目录名即为 workspaceId。它也是 `workspace.json` 中 `folder` / `workspace` 字段的映射目标。

---

## 2. context.storageUri 反推 workspaceStorage 根路径

`ExtensionContext.storageUri` 的标准结构为：

```
<workspaceStorageHome>/<workspaceId>/<extensionId>
```

例如：
```
C:/Users/xxx/AppData/Roaming/Code/User/workspaceStorage/<hex32>/memory-board.memory-board
```

**反推技巧**（用于 memory-board 扩展读取同级 GitHub.copilot-chat 目录）：

```typescript
// 向上 2 级得到 workspaceStorageHome；倒数第 2 级是 workspaceId
const parts = storageUri.fsPath.split(path.sep).filter(p => p.length > 0);
const wsIdx = parts.findIndex(p => p.toLowerCase() === 'workspacestorage');
const workspaceId = parts[wsIdx + 1];
const workspaceStoragePath = parts.slice(0, wsIdx + 1).join(path.sep);
```

此方法自动适配正式版（Code）与 Insiders（Code - Insiders），无需手动判断版本。

---

## 3. vscode.env.uriScheme 区分 Insiders

`vscode.env.uriScheme` 的值：
- 正式版：`"code"`
- Insiders：`"code-insiders"`
- Code - OSS Dev：`"code-oss"`

**推荐的最稳健判断方式**：

```typescript
function isInsiders(): boolean {
  return vscode.env.uriScheme === 'code-insiders';
}
```

**注意**：`vscode.env.appQuality` 是 proposed API，普通扩展无法使用，不要依赖它。

**备选方案**（兼容非官方 fork）：

```typescript
const isInsiders = vscode.env.appName.includes('Insiders');
```

---

## 4. 跨扩展读取 workspaceStorage 的可行性

**结论**：**完全可行，无 API 隔离限制**。

VS Code 的 workspaceStorage 没有基于扩展 ID 的权限隔离。任何扩展都可以通过 Node.js `fs` 模块直接读取其他扩展写入的文件。

```typescript
// 读取 GitHub.copilot-chat 写入的 memory 目录
const memoriesPath = path.join(
  workspaceStoragePath,
  workspaceId,
  'GitHub.copilot-chat',
  'memory-tool',
  'memories'
);
const entries = await fs.promises.readdir(memoriesPath, { withFileTypes: true });
```

**限制**：
- `vscode.workspace.fs`（虚拟文件系统 API）可以读取本地磁盘文件，但 Node.js `fs` 在扩展宿主进程中同样可用且更直接
- 本项目选择使用 Node.js `fs`，因为它是纯 Node 环境，无浏览器限制

---

## 5. JSONL 格式解析规则（ObjectMutationLog）

Copilot Chat 的会话历史存储在 `chatSessions/<sessionId>.jsonl` 中，使用 VS Code 内部的 `ObjectMutationLog` 序列化格式：

| kind 值 | 含义 | 结构 |
|---------|------|------|
| 0 | Initial（全量快照） | `{"kind":0,"v":{...完整对象...}}` |
| 1 | Set（属性更新） | `{"kind":1,"k":["path","to","field"],"v":新值}` |
| 2 | Push（数组追加） | `{"kind":2,"k":["arrayField"],"v":[新元素],"i":索引?}` |
| 3 | Delete（属性删除） | `{"kind":3,"k":["path","to","field"]}` |

**解析策略**（简化版，仅提取我们需要的字段）：

```typescript
function parseChatSessionJsonl(content: string): {
  sessionId: string;
  createdAt: number;
  customTitle?: string;
  firstUserMessage?: string;
} {
  // 1. 逐行 JSON.parse
  // 2. kind:0 行 → 提取 sessionId / creationDate / requests[0].message
  // 3. kind:1 行且 k=["customTitle"] → 累积 customTitle
  // 4. kind:1 行且 k=["inputState","inputText"] → fallback 首条用户消息
  // 5. kind:2 行且 k=["requests"] → 提取追加的 request.message
}
```

**Session 标题优先级**：
1. `customTitle`（kind:1 drain 行，LLM 自动生成或用户重命名）
2. 首条用户消息文本（前 80 字符）
3. fallback `"<未命名会话>"`

---

## 6. memories 目录结构与 base64 编码

```
workspaceStorage/<workspaceId>/GitHub.copilot-chat/memory-tool/memories/
├── repo/                                            ← 工作区级记忆（固定名称）
│   ├── gui-mock-data-flow.md
│   └── vscode-webview-fix.md
├── <base64(SESSION_UUID_1)>/                        ← session 级记忆
│   └── plan.md
├── <base64(SESSION_UUID_2)>/
│   └── plan.md
└── ...
```

**base64 编码规则**：
```typescript
// 编码：UUID → base64 目录名
const dirName = Buffer.from(sessionUuid).toString('base64');

// 解码：目录名 → UUID（仅当解码结果符合 UUID 格式时有效）
const decoded = Buffer.from(dirName, 'base64').toString('utf8');
// 格式校验：/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

**与 chatSessions 的关联**：
- `memories/<base64(uuid)>/` 解码后得到的 UUID = `chatSessions/<uuid>.jsonl` 的文件名
- `.jsonl` 文件包含该 session 的完整对话历史和元数据（如 `customTitle`）

---

## 7. 完整路径映射速查表

| 层级 | 路径模式 | 对应类型 |
|------|---------|---------|
| 工作区 | `workspaceStorage/<workspaceId>/` | `Workspace` |
| 工作区元数据 | `workspaceStorage/<id>/workspace.json` | folder URI + name |
| 记忆根目录 | `…/GitHub.copilot-chat/memory-tool/memories/` | 存在性判断 |
| 工作区级记忆 | `…/memories/repo/` | `Session(isRepo=true)` |
| session 级记忆 | `…/memories/<base64(uuid)>/` | `Session` |
| memory 条目 | `…/memories/<subdir>/*.md` | `MemoryEntry` |
| session 元数据 | `…/chatSessions/<uuid>.jsonl` | title + createdAt |

---

## 8. 参考源码位置（VS Code 仓库）

- `src/vs/platform/workspaces/node/workspaces.ts` — getWorkspaceIdentifier（MD5）
- `src/vs/platform/storage/electron-main/storageMain.ts` — workspace.json 写入
- `src/vs/workbench/api/common/extHostStoragePaths.ts` — context.storageUri 结构
- `src/vs/workbench/contrib/chat/common/model/chatModel.ts` — ChatModel 序列化
- `src/vs/workbench/contrib/chat/common/model/objectMutationLog.ts` — JSONL kind 0/1/2/3
- `src/vs/workbench/api/common/extHost.api.impl.ts` — env.uriScheme / env.appName

---

*本文档由 memory-board 扩展开发过程中研究整理，供后续开发参考。*
