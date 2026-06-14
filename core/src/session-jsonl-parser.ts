// ============================================================================
// @memory-board/core — Copilot Chat Session JSONL Parser
// ============================================================================
// 解析 workspaceStorage/<workspaceId>/chatSessions/<sessionId>.jsonl 文件，
// 提取 sessionId / creationDate / customTitle / 首条用户消息文本等关键信息。
//
// JSONL 由 VS Code 的 ObjectMutationLog 序列化格式构成：
//   {"kind":0,"v":{...}}                   ← Initial 全量快照（仅第 1 行）
//   {"kind":1,"k":[...路径段...],"v":值}    ← Set（属性更新）
//   {"kind":2,"k":[...],"v":[...]},”i”?:idx ← Push（数组追加）
//   {"kind":3,"k":[...]}                    ← Delete
//
// 本模块只取我们需要的信息，不还原完整的 requests/responses 结构。
// ============================================================================

/**
 * 解析后的 Copilot Chat Session 元数据。
 */
export interface ParsedChatSession {
  /** Session UUID（与 jsonl 文件名一致） */
  sessionId: string;
  /** 创建时间戳（来自 jsonl kind:0 的 v.creationDate，Unix 毫秒） */
  createdAt: number;
  /** Custom title（来自 kind:1 k=["customTitle"] 的 drain 行，可选） */
  customTitle?: string;
  /** 首条用户消息文本（来自 kind:0/2 的 requests[0].message，可选） */
  firstUserMessage?: string;
}

/**
 * ObjectMutationLog 的 EntryKind 枚举值。
 * 仅用于 jsonl 解析过程中识别行类型，不需要全字段。
 */
const ENTRY_KIND = {
  INITIAL: 0,
  SET: 1,
  PUSH: 2,
  DELETE: 3,
} as const;

/**
 * 解析单条 jsonl 行的最小结构。
 */
interface JsonlLine {
  kind: number;
  /** 属性路径段数组（kind!=0 时存在） */
  k?: string[];
  /** 值（kind=0 时是完整快照对象；kind=1 时是新值；kind=2 时是新增元素） */
  v?: unknown;
}

/**
 * 解析 Copilot Chat Session 的 jsonl 文件全文，提取关键元数据。
 *
 * 算法：
 * 1. 按行切分（最后一行可能为空），逐行 JSON.parse
 * 2. 第一行（kind:0）携带完整快照，从中提取 creationDate / sessionId / requests[0].message
 * 3. 后续 kind:1 行如果 k=["customTitle"] 则累积为 customTitle
 * 4. 后续 kind:1 行如果 k=["inputState","inputText"] 则视为潜在的首条输入文本
 * 5. 后续 kind:2 行如果 k=["requests"] 则取新增元素的 message 作为首条用户消息
 *
 * 任何行解析失败均会被静默跳过，保证部分损坏的 jsonl 也能尽可能返回信息。
 *
 * @param content jsonl 文件全文
 * @returns 解析后的 ParsedChatSession；若完全无法解析则返回 sessionId="" / createdAt=0
 */
export function parseChatSessionJsonl(content: string): ParsedChatSession {
  const result: ParsedChatSession = {
    sessionId: "",
    createdAt: 0,
  };

  const lines = content.split(/\r?\n/);
  let firstUserMessage: string | undefined;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    let line: JsonlLine;
    try {
      line = JSON.parse(trimmed) as JsonlLine;
    } catch {
      // 单行损坏不影响整体解析
      continue;
    }

    if (line.kind === ENTRY_KIND.INITIAL && line.v && typeof line.v === "object") {
      const snapshot = line.v as Record<string, unknown>;
      if (typeof snapshot["sessionId"] === "string") {
        result.sessionId = snapshot["sessionId"];
      }
      if (typeof snapshot["creationDate"] === "number") {
        result.createdAt = snapshot["creationDate"];
      }

      // 从 requests 数组中提取首条用户消息
      const requests = snapshot["requests"];
      firstUserMessage = firstUserMessage ?? extractFirstRequestMessage(requests);
    } else if (line.kind === ENTRY_KIND.SET && line.k && line.k.length > 0) {
      const path = line.k;

      // customTitle drain（最常见路径）
      if (path.length === 1 && path[0] === "customTitle") {
        if (typeof line.v === "string") {
          result.customTitle = line.v;
        }
      }

      // inputState.inputText drain（首条用户输入的 fallback 来源之一）
      if (
        !firstUserMessage &&
        path.length === 2 &&
        path[0] === "inputState" &&
        path[1] === "inputText" &&
        typeof line.v === "string" &&
        line.v.trim().length > 0
      ) {
        firstUserMessage = line.v;
      }

      // requests 整体 set（覆盖式）
      if (!firstUserMessage && path.length === 1 && path[0] === "requests") {
        firstUserMessage = extractFirstRequestMessage(line.v);
      }
    } else if (line.kind === ENTRY_KIND.PUSH && line.k && line.k.length === 1 && line.k[0] === "requests") {
      // requests 数组的追加事件：v 通常是新增的 request 对象（或其数组）
      if (!firstUserMessage) {
        const newItems = Array.isArray(line.v) ? line.v : [line.v];
        for (const item of newItems) {
          const msg = extractMessageFromRequestObject(item);
          if (msg) {
            firstUserMessage = msg;
            break;
          }
        }
      }
    }
    // kind:3 (Delete) 当前不影响我们要提取的字段，跳过
  }

  if (firstUserMessage !== undefined) {
    result.firstUserMessage = firstUserMessage;
  }

  return result;
}

/**
 * 从 requests 字段中尝试取出第一条 request 的 message 文本。
 * request.message 可能是 string 或 { text: string } 对象（IParsedChatRequest）。
 */
function extractFirstRequestMessage(requests: unknown): string | undefined {
  if (!Array.isArray(requests) || requests.length === 0) {
    return undefined;
  }
  return extractMessageFromRequestObject(requests[0]);
}

/**
 * 从单个 request 对象中提取 message 文本。
 */
function extractMessageFromRequestObject(req: unknown): string | undefined {
  if (!req || typeof req !== "object") {
    return undefined;
  }
  const message = (req as Record<string, unknown>)["message"];
  if (typeof message === "string") {
    return message;
  }
  if (message && typeof message === "object") {
    const text = (message as Record<string, unknown>)["text"];
    if (typeof text === "string") {
      return text;
    }
  }
  return undefined;
}
