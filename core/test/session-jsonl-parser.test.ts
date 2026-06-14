// ============================================================================
// session-jsonl-parser 测试
// ============================================================================
// 使用真实 JSONL 样例验证 customTitle 解析、kind 0/1 累积与首条用户消息 fallback
// ============================================================================

import { describe, it, expect } from "vitest";
import { parseChatSessionJsonl, type ParsedChatSession } from "../src/session-jsonl-parser.js";

describe("parseChatSessionJsonl", () => {
  // -------------------------------------------------------------------------
  // 基本解析：kind:0 + kind:1 customTitle
  // -------------------------------------------------------------------------
  describe("kind:0 + kind:1 customTitle（典型场景）", () => {
    const jsonl = [
      // kind:0 — 元数据行
      JSON.stringify({
        kind: 0,
        v: {
          version: 3,
          creationDate: 1781408498446,
          initialLocation: "panel",
          responderUsername: "",
          sessionId: "5be07351-9322-44d2-bc14-8445d65b1b3c",
          hasPendingEdits: false,
          requests: [],
          pendingRequests: [],
          inputState: { attachments: [] },
        },
      }),
      // kind:1 — responderUsername drain
      JSON.stringify({ kind: 1, k: ["responderUsername"], v: "GitHub Copilot" }),
      // kind:1 — customTitle drain（来自实测数据）
      JSON.stringify({ kind: 1, k: ["customTitle"], v: "制定Copilot memory文件加载计划" }),
    ].join("\n");

    it("应提取 sessionId", () => {
      const result = parseChatSessionJsonl(jsonl);
      expect(result.sessionId).toBe("5be07351-9322-44d2-bc14-8445d65b1b3c");
    });

    it("应提取 creationDate", () => {
      const result = parseChatSessionJsonl(jsonl);
      expect(result.createdAt).toBe(1781408498446);
    });

    it("应提取 customTitle", () => {
      const result = parseChatSessionJsonl(jsonl);
      expect(result.customTitle).toBe("制定Copilot memory文件加载计划");
    });

    it("无 requests 时 firstUserMessage 应为 undefined", () => {
      const result = parseChatSessionJsonl(jsonl);
      expect(result.firstUserMessage).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 从 requests 数组提取首条用户消息
  // -------------------------------------------------------------------------
  describe("从 requests 数组提取首条用户消息", () => {
    const sessionId = "2e4d6241-af91-48d3-9252-e311ba1ce135";
    const firstMessage = "当前的gui 显示效果，界面显示比例还是太小了，请帮我修复";

    const jsonl = [
      JSON.stringify({
        kind: 0,
        v: {
          version: 3,
          creationDate: 1781351206380,
          sessionId,
          requests: [
            {
              requestId: "req-001",
              message: firstMessage,
              timestamp: 1781351206380,
            },
          ],
          inputState: { attachments: [] },
        },
      }),
      // kind:1 — requests 数组整体 set（替代原数组）
      JSON.stringify({
        kind: 1,
        k: ["requests"],
        v: [
          {
            requestId: "req-001",
            message: { text: firstMessage },
            timestamp: 1781351206380,
          },
        ],
      }),
    ].join("\n");

    it("应提取首条用户消息（string 格式）", () => {
      const result = parseChatSessionJsonl(jsonl);
      // kind:0 中 requests[0].message 是 string，优先级高于后续 kind:1 覆盖
      expect(result.firstUserMessage).toBe(firstMessage);
    });

    it("应保留 kind:0 中的 sessionId", () => {
      const result = parseChatSessionJsonl(jsonl);
      expect(result.sessionId).toBe(sessionId);
    });
  });

  // -------------------------------------------------------------------------
  // IParsedChatRequest 格式（message 是对象而非字符串）
  // -------------------------------------------------------------------------
  describe("IParsedChatRequest 格式（message.text）", () => {
    const jsonl = JSON.stringify({
      kind: 0,
      v: {
        version: 3,
        creationDate: 1700000000000,
        sessionId: "aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee",
        requests: [
          {
            requestId: "req-abc",
            message: { text: "帮我写一个 React 组件", parts: [] },
          },
        ],
      },
    });

    it("应从 message.text 提取用户消息", () => {
      const result = parseChatSessionJsonl(jsonl);
      expect(result.firstUserMessage).toBe("帮我写一个 React 组件");
    });
  });

  // -------------------------------------------------------------------------
  // inputState.inputText 作为首条消息 fallback
  // -------------------------------------------------------------------------
  describe("inputState.inputText fallback", () => {
    const jsonl = [
      JSON.stringify({
        kind: 0,
        v: {
          version: 3,
          creationDate: 1700000000000,
          sessionId: "input-test-uuid-here-00000000",
          requests: [],
          inputState: { attachments: [] },
        },
      }),
      JSON.stringify({
        kind: 1,
        k: ["inputState", "inputText"],
        v: "这是我正在输入的内容",
      }),
    ].join("\n");

    it("应通过 inputState.inputText 提取消息", () => {
      const result = parseChatSessionJsonl(jsonl);
      expect(result.firstUserMessage).toBe("这是我正在输入的内容");
    });
  });

  // -------------------------------------------------------------------------
  // kind:2 (Push) — requests 数组追加
  // -------------------------------------------------------------------------
  describe("kind:2 requests Push 追加", () => {
    const jsonl = [
      JSON.stringify({
        kind: 0,
        v: {
          version: 3,
          creationDate: 1700000000000,
          sessionId: "push-test-uuid-0000-0000-000000000000",
          requests: [],
        },
      }),
      // kind:2 — 追加一个 request 到 requests 数组
      JSON.stringify({
        kind: 2,
        k: ["requests"],
        v: [
          {
            requestId: "req-002",
            message: "Push 追加的用户消息",
            timestamp: 1700000001000,
          },
        ],
      }),
    ].join("\n");

    it("应从 kind:2 Push 中提取首条用户消息", () => {
      const result = parseChatSessionJsonl(jsonl);
      expect(result.firstUserMessage).toBe("Push 追加的用户消息");
    });
  });

  // -------------------------------------------------------------------------
  // 空输入
  // -------------------------------------------------------------------------
  describe("空输入", () => {
    it("空字符串应返回空结果", () => {
      const result = parseChatSessionJsonl("");
      expect(result.sessionId).toBe("");
      expect(result.createdAt).toBe(0);
      expect(result.customTitle).toBeUndefined();
      expect(result.firstUserMessage).toBeUndefined();
    });

    it("只有换行符应返回空结果", () => {
      const result = parseChatSessionJsonl("\n\n\r\n");
      expect(result.sessionId).toBe("");
      expect(result.createdAt).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 损坏行容忍
  // -------------------------------------------------------------------------
  describe("损坏行容忍", () => {
    const jsonl = [
      "这是一行无效的 JSON",
      JSON.stringify({
        kind: 0,
        v: {
          version: 3,
          creationDate: 1700000000000,
          sessionId: "damaged-test-uuid-0000-0000-0000000000",
        },
      }),
      "###invalid###",
      JSON.stringify({ kind: 1, k: ["customTitle"], v: "有效标题" }),
    ].join("\n");

    it("应跳过损坏行继续解析", () => {
      const result = parseChatSessionJsonl(jsonl);
      expect(result.sessionId).toBe("damaged-test-uuid-0000-0000-0000000000");
      expect(result.customTitle).toBe("有效标题");
    });
  });

  // -------------------------------------------------------------------------
  // 真实数据样例（来自实际 workspaceStorage）
  // -------------------------------------------------------------------------
  describe("真实数据样例：5be07351-9322-44d2-bc14-8445d65b1b3c", () => {
    // 直接使用实测内容（已被截断保护隐私）
    const jsonl = [
      `{"kind":0,"v":{"version":3,"creationDate":1781408498446,"initialLocation":"panel","responderUsername":"","sessionId":"5be07351-9322-44d2-bc14-8445d65b1b3c","hasPendingEdits":false,"requests":[],"pendingRequests":[],"inputState":{"attachments":[],"mode":{"id":"agent","kind":"agent"},"selectedModel":{"identifier":"customendpoint/MiMo/mimo-v2.5","metadata":{"extension":{"value":"GitHub.copilot-chat"}}},"inputText":"","selections":[],"permissionLevel":"default","contrib":{"chatDynamicVariableModel":[]}}}}`,
      `{"kind":1,"k":["responderUsername"],"v":"GitHub Copilot"}`,
      `{"kind":1,"k":["customTitle"],"v":"制定Copilot memory文件加载计划"}`,
    ].join("\n");

    it("应正确解析 sessionId", () => {
      expect(parseChatSessionJsonl(jsonl).sessionId).toBe(
        "5be07351-9322-44d2-bc14-8445d65b1b3c"
      );
    });

    it("应正确解析 creationDate", () => {
      expect(parseChatSessionJsonl(jsonl).createdAt).toBe(1781408498446);
    });

    it("应正确解析 customTitle", () => {
      expect(parseChatSessionJsonl(jsonl).customTitle).toBe(
        "制定Copilot memory文件加载计划"
      );
    });
  });
});
