# GUI ↔ Extension Host 通信协议 (postMessage Protocol)

本文档定义了 `@memory-board/gui`（运行在 Webview 中）与宿主环境（VS Code 插件 / 未来的 Electron 主进程）之间的 JSON 消息通信契约。

## 1. 信封格式 (Envelope)

所有消息遵循统一的信封结构，分为 **Request（请求）** 和 **Response（响应）** 两种方向。

### 1.1 Request（GUI → Host）

```typescript
interface RequestMessage {
  /** 消息类型标识符 */
  type: string;
  /** 唯一请求 ID，用于匹配异步响应 */
  requestId: string;
  /** 请求负载，根据 type 不同而不同 */
  payload: Record<string, unknown>;
}
```

### 1.2 Response（Host → GUI）

```typescript
interface ResponseMessage {
  /** 与请求相同的消息类型标识符 */
  type: string;
  /** 与请求对应的唯一请求 ID */
  requestId: string;
  /** 响应负载 */
  payload: Record<string, unknown>;
  /** 错误信息，成功时为 null */
  error: string | null;
}
```

---

## 2. 消息类型定义

### 2.1 `getRepos` — 获取仓库列表

获取本地已扫描到的 Copilot 记忆仓库列表。

**Request:**
```json
{
  "type": "getRepos",
  "requestId": "req-001",
  "payload": {}
}
```

**Response (Success):**
```json
{
  "type": "getRepos",
  "requestId": "req-001",
  "payload": {
    "repos": [
      {
        "id": "repo-abc123",
        "name": "my-project",
        "path": "/home/user/.copilot/memory/my-project",
        "sessionCount": 5,
        "lastModified": "2025-12-01T10:30:00Z"
      }
    ]
  },
  "error": null
}
```

**Response (Error):**
```json
{
  "type": "getRepos",
  "requestId": "req-001",
  "payload": {},
  "error": "Failed to scan memory directory: ENOENT"
}
```

---

### 2.2 `getSessionsByRepo` — 获取指定仓库的会话列表

根据仓库 ID 获取该仓库下所有 Session 的摘要信息。

**Request:**
```json
{
  "type": "getSessionsByRepo",
  "requestId": "req-002",
  "payload": {
    "repoId": "repo-abc123"
  }
}
```

**Response (Success):**
```json
{
  "type": "getSessionsByRepo",
  "requestId": "req-002",
  "payload": {
    "sessions": [
      {
        "id": "session-xyz789",
        "repoId": "repo-abc123",
        "title": "Session 2025-12-01 #1",
        "createdAt": "2025-12-01T08:00:00Z",
        "entryCount": 12
      }
    ]
  },
  "error": null
}
```

---

### 2.3 `readMemoryContent` — 读取指定会话的记忆内容

读取某个 Session 下的完整记忆条目（Memory Entries）。

**Request:**
```json
{
  "type": "readMemoryContent",
  "requestId": "req-003",
  "payload": {
    "sessionId": "session-xyz789"
  }
}
```

**Response (Success):**
```json
{
  "type": "readMemoryContent",
  "requestId": "req-003",
  "payload": {
    "entries": [
      {
        "id": "entry-001",
        "sessionId": "session-xyz789",
        "content": "User prefers functional React components with hooks...",
        "category": "preference",
        "timestamp": "2025-12-01T08:05:00Z",
        "sourceFile": "memory-001.md"
      }
    ]
  },
  "error": null
}
```

---

## 3. 推送消息（Host → GUI，非请求-响应）

### 3.1 `onReposChanged` — 仓库列表变更通知

当文件系统监控检测到记忆文件变更时，主动推送更新。

```json
{
  "type": "onReposChanged",
  "requestId": "",
  "payload": {
    "repos": [ /* 同 getRepos 响应格式 */ ]
  },
  "error": null
}
```

---

## 4. 错误码约定

| 错误前缀 | 含义 |
|----------|------|
| `SCAN_ERROR:` | 目录扫描失败 |
| `PARSE_ERROR:` | 文件解析失败 |
| `NOT_FOUND:` | 指定的仓库或会话不存在 |
| `IO_ERROR:` | 文件系统 I/O 错误 |

---

## 5. 传输层适配

| 运行环境 | 传输方式 | GUI 发送 | GUI 接收 |
|---------|---------|---------|---------|
| VS Code Webview | `postMessage` | `vscodeApi.postMessage(msg)` | `window.addEventListener('message', ...)` |
| Electron (未来) | IPC | `ipcRenderer.send(channel, msg)` | `ipcRenderer.on(channel, ...)` |
| 独立浏览器 (开发) | Mock | 直接返回 Mock 数据 | 无需监听 |
