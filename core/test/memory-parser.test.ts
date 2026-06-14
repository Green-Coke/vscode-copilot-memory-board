// ============================================================================
// memory-parser 集成测试
// ============================================================================
// 使用 tmpdir 构造假的 workspaceStorage 结构，
// 验证 scanWorkspaces / getSessionsByWorkspace / readMemoryContent 的正确性
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  MemoryParser,
  decodeSessionDirName,
  uriToFsPath,
} from "../src/memory-parser.js";
import { DEFAULT_SESSION_IDS } from "../src/types.js";

// 测试使用的临时目录，每个测试用例独立创建并自动清理
let tmpDir: string;

// 被测试的 sessionId 与对应的 base64 编码目录名
const TEST_SESSION_UUID = "2e4d6241-af91-48d3-9252-e311ba1ce135";
const TEST_SESSION_B64 = Buffer.from(TEST_SESSION_UUID).toString("base64");

const TEST_SESSION_UUID_2 = "5be07351-9322-44d2-bc14-8445d65b1b3c";
const TEST_SESSION_B64_2 = Buffer.from(TEST_SESSION_UUID_2).toString("base64");

// 工作区标识
const WORKSPACE_ID = "cd816c4554674166c9322bed2e4c5f6d";

// jsonl 样本内容（简化版，包含 customTitle）
const JSONL_CONTENT_SESSION_1 = [
  JSON.stringify({
    kind: 0,
    v: {
      version: 3,
      creationDate: 1781351206380,
      sessionId: TEST_SESSION_UUID,
      requests: [],
      inputState: { attachments: [] },
    },
  }),
  JSON.stringify({ kind: 1, k: ["responderUsername"], v: "GitHub Copilot" }),
  JSON.stringify({
    kind: 1,
    k: ["customTitle"],
    v: "制定Copilot memory文件加载计划",
  }),
].join("\n");

const JSONL_CONTENT_SESSION_2 = [
  JSON.stringify({
    kind: 0,
    v: {
      version: 3,
      creationDate: 1781408498446,
      sessionId: TEST_SESSION_UUID_2,
      requests: [
        { requestId: "req-1", message: "GUI 显示比例太小了", timestamp: 1781408498446 },
      ],
      inputState: { attachments: [] },
    },
  }),
  JSON.stringify({ kind: 1, k: ["customTitle"], v: "制定Copilot memory文件加载计划" }),
].join("\n");

/**
 * 在 tmpDir 中构造一份假的 workspaceStorage 目录结构
 */
function createMockWorkspaceStorage(baseDir: string) {
  // workspaceStorage/<workspaceId>/workspace.json
  const wsDir = path.join(baseDir, WORKSPACE_ID);
  fs.mkdirSync(wsDir, { recursive: true });
  fs.writeFileSync(
    path.join(wsDir, "workspace.json"),
    JSON.stringify({ folder: "file:///e%3A/projects/vscode-copilot-memory-board" }),
    "utf8"
  );

  // memories 目录
  const memoriesDir = path.join(wsDir, "GitHub.copilot-chat", "memory-tool", "memories");
  fs.mkdirSync(memoriesDir, { recursive: true });

  // repo/ 目录 — 工作区级记忆
  const repoDir = path.join(memoriesDir, "repo");
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, "gui-mock-data-flow.md"), "# GUI Mock Data Flow\n\n本文档记录了...", "utf8");
  fs.writeFileSync(path.join(repoDir, "vscode-webview-fix.md"), "# WebView Fix\n\n修复了...", "utf8");

  // Session 1 目录（base64 编码）
  const session1Dir = path.join(memoriesDir, TEST_SESSION_B64);
  fs.mkdirSync(session1Dir, { recursive: true });
  fs.writeFileSync(path.join(session1Dir, "plan.md"), "# Plan: 重命名\n\n本次改造计划...", "utf8");

  // Session 2 目录（base64 编码）
  const session2Dir = path.join(memoriesDir, TEST_SESSION_B64_2);
  fs.mkdirSync(session2Dir, { recursive: true });
  fs.writeFileSync(path.join(session2Dir, "plan.md"), "# Plan: memory文件加载\n\n加载计划...", "utf8");

  // chatSessions 目录（jsonl 元数据）
  // 注意：实测磁盘上 chatSessions 与 GitHub.copilot-chat 是平级兄弟目录（都在 workspaceId 下），
  // 不能把 chatSessions 放在 GitHub.copilot-chat 下面。
  const chatSessionsDir = path.join(wsDir, "chatSessions");
  fs.mkdirSync(chatSessionsDir, { recursive: true });
  fs.writeFileSync(path.join(chatSessionsDir, `${TEST_SESSION_UUID}.jsonl`), JSONL_CONTENT_SESSION_1, "utf8");
  fs.writeFileSync(path.join(chatSessionsDir, `${TEST_SESSION_UUID_2}.jsonl`), JSONL_CONTENT_SESSION_2, "utf8");
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-parser-test-"));
  createMockWorkspaceStorage(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// =========================================================================
// decodeSessionDirName
// =========================================================================
describe("decodeSessionDirName", () => {
  it("应正确解码 base64 编码的 sessionId", () => {
    const result = decodeSessionDirName(TEST_SESSION_B64);
    expect(result).toBe(TEST_SESSION_UUID);
  });

  it("无效 base64 应返回 undefined", () => {
    expect(decodeSessionDirName("not-valid-base64!!!")).toBeUndefined();
  });

  it("解码结果不是 UUID 格式应返回 undefined", () => {
    const notUuid = Buffer.from("hello world").toString("base64");
    expect(decodeSessionDirName(notUuid)).toBeUndefined();
  });
});

// =========================================================================
// uriToFsPath
// =========================================================================
describe("uriToFsPath", () => {
  it("file:// URI 应转换为文件路径", () => {
    const result = uriToFsPath("file:///e%3A/projects/vscode-copilot-memory-board");
    // Windows 应该是 e:\projects\...；POSIX 是 /e:/projects/...
    expect(result).toContain("projects");
    expect(result).toContain("vscode-copilot-memory-board");
  });

  it("非 file: 协议应返回空字符串", () => {
    expect(uriToFsPath("https://example.com")).toBe("");
  });
});

// =========================================================================
// scanWorkspaces
// =========================================================================
describe("MemoryParser.scanWorkspaces", () => {
  it("应扫描到 1 个有效工作区", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const workspaces = await parser.scanWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].id).toBe(WORKSPACE_ID);
  });

  it("应从 workspace.json 解析出工作区名称", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const workspaces = await parser.scanWorkspaces();
    expect(workspaces[0].name).toBe("vscode-copilot-memory-board");
  });

  it("应正确解析 folder URI 为真实路径", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const workspaces = await parser.scanWorkspaces();
    expect(workspaces[0].path).toContain("projects");
    expect(workspaces[0].path).toContain("vscode-copilot-memory-board");
  });

  it("sessionCount 应包含 repo 特殊 session + 普通 session", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const workspaces = await parser.scanWorkspaces();
    // repo(1) + session1(1) + session2(1) = 3
    expect(workspaces[0].sessionCount).toBe(3);
  });
});

// =========================================================================
// getSessionsByWorkspace
// =========================================================================
describe("MemoryParser.getSessionsByWorkspace", () => {
  it("应返回 3 个 session（1 repo + 2 普通）", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const sessions = await parser.getSessionsByWorkspace(WORKSPACE_ID);
    expect(sessions).toHaveLength(3);
  });

  it("repo 目录应映射为 isRepo=true 特殊 session", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const sessions = await parser.getSessionsByWorkspace(WORKSPACE_ID);
    const repoSession = sessions.find((s) => s.isRepo === true);
    expect(repoSession).toBeDefined();
    expect(repoSession!.id).toBe(DEFAULT_SESSION_IDS.REPO);
    expect(repoSession!.title).toBe("工作区级目录");
    expect(repoSession!.workspaceId).toBe(WORKSPACE_ID);
  });

  it("repo session 的 entryCount 应为 2（2 个任意类型的文件）", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const sessions = await parser.getSessionsByWorkspace(WORKSPACE_ID);
    const repoSession = sessions.find((s) => s.isRepo === true);
    expect(repoSession!.entryCount).toBe(2);
  });

  it("普通 session 的 sessionId 应被 base64 解码", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const sessions = await parser.getSessionsByWorkspace(WORKSPACE_ID);
    const normalSessions = sessions.filter((s) => !s.isRepo);
    const ids = normalSessions.map((s) => s.id);
    expect(ids).toContain(TEST_SESSION_UUID);
    expect(ids).toContain(TEST_SESSION_UUID_2);
  });

  it("普通 session 的 title 应从 jsonl customTitle 提取", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const sessions = await parser.getSessionsByWorkspace(WORKSPACE_ID);
    const session1 = sessions.find((s) => s.id === TEST_SESSION_UUID);
    expect(session1).toBeDefined();
    expect(session1!.title).toBe("制定Copilot memory文件加载计划");
  });

  it("普通 session 的 createdAt 应为 ISO 8601 格式", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const sessions = await parser.getSessionsByWorkspace(WORKSPACE_ID);
    const session1 = sessions.find((s) => s.id === TEST_SESSION_UUID);
    expect(session1!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("不存在的 workspaceId 应返回空数组", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const sessions = await parser.getSessionsByWorkspace("non-existent-id");
    expect(sessions).toHaveLength(0);
  });
});

// =========================================================================
// readMemoryContent
// =========================================================================
describe("MemoryParser.readMemoryContent", () => {
  it("repo session 应读取到 2 个 MemoryEntry", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const entries = await parser.readMemoryContent(
      DEFAULT_SESSION_IDS.REPO,
      WORKSPACE_ID,
    );
    expect(entries).toHaveLength(2);
  });

  it("repo session 的 MemoryEntry 应包含文件正文", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const entries = await parser.readMemoryContent(
      DEFAULT_SESSION_IDS.REPO,
      WORKSPACE_ID,
    );
    const contents = entries.map((e) => e.content);
    expect(contents.some((c) => c.includes("GUI Mock Data Flow"))).toBe(true);
    expect(contents.some((c) => c.includes("WebView Fix"))).toBe(true);
  });

  it("repo session 的 MemoryEntry 的 sourceFile 应为绝对路径", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const entries = await parser.readMemoryContent(
      DEFAULT_SESSION_IDS.REPO,
      WORKSPACE_ID,
    );
    const sourceFiles = entries.map((e) => e.sourceFile);
    // sourceFile 必须是完整绝对路径，供扩展端用 vscode.Uri.file() 打开
    expect(sourceFiles.some((p) => p?.endsWith("gui-mock-data-flow.md"))).toBe(true);
    expect(sourceFiles.some((p) => p?.endsWith("vscode-webview-fix.md"))).toBe(true);
    sourceFiles.forEach((p) => {
      expect(path.isAbsolute(p)).toBe(true);
    });
  });

  it("普通 session 应读取到 1 个 MemoryEntry（plan.md）", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const entries = await parser.readMemoryContent(
      TEST_SESSION_UUID,
      WORKSPACE_ID,
    );
    expect(entries).toHaveLength(1);
    // sourceFile 是绝对路径，但末尾应为 plan.md
    expect(entries[0].sourceFile?.endsWith("plan.md")).toBe(true);
    expect(path.isAbsolute(entries[0].sourceFile)).toBe(true);
    expect(entries[0].content).toContain("重命名");
  });

  it("MemoryEntry 的 category 应为 unknown", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const entries = await parser.readMemoryContent(
      TEST_SESSION_UUID,
      WORKSPACE_ID,
    );
    expect(entries[0].category).toBe("unknown");
  });

  it("不存在的 sessionId 应返回空数组", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const entries = await parser.readMemoryContent(
      "non-existent-session",
      WORKSPACE_ID,
    );
    expect(entries).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 递归扫描：目录与子目录都应该被读取
  // ---------------------------------------------------------------------------
  describe("递归扫描子目录", () => {
    beforeEach(() => {
      // 在 repo session 下追加一个嵌套子目录结构：
      //   repo/
      //     gui-mock-data-flow.md       (既有)
      //     vscode-webview-fix.md       (既有)
      //     notes/
      //       nested.md
      //       deep/
      //         deep.md
      const repoDir = path.join(
        tmpDir,
        WORKSPACE_ID,
        "GitHub.copilot-chat",
        "memory-tool",
        "memories",
        "repo",
      );
      const notesDir = path.join(repoDir, "notes");
      const deepDir = path.join(notesDir, "deep");
      fs.mkdirSync(deepDir, { recursive: true });
      fs.writeFileSync(path.join(notesDir, "nested.md"), "# Nested\n\n子目录文件", "utf8");
      fs.writeFileSync(path.join(deepDir, "deep.md"), "# Deep\n\n更深层的文件", "utf8");
    });

    it("readMemoryContent 应返回目录节点（isDirectory=true）", async () => {
      const parser = new MemoryParser({ basePath: tmpDir });
      const entries = await parser.readMemoryContent(
        DEFAULT_SESSION_IDS.REPO,
        WORKSPACE_ID,
      );
      const dirs = entries.filter((e) => e.isDirectory);
      // 至少应包含 notes 与 notes/deep 两个目录节点
      const relativePaths = dirs.map((d) => d.relativePath);
      expect(relativePaths).toContain("notes");
      expect(relativePaths).toContain("notes/deep");
    });

    it("子目录内的文件也应被读取，relativePath 反映层级结构", async () => {
      const parser = new MemoryParser({ basePath: tmpDir });
      const entries = await parser.readMemoryContent(
        DEFAULT_SESSION_IDS.REPO,
        WORKSPACE_ID,
      );
      const files = entries.filter((e) => !e.isDirectory);
      const relativePaths = files.map((f) => f.relativePath);
      expect(relativePaths).toContain("notes/nested.md");
      expect(relativePaths).toContain("notes/deep/deep.md");
      // 同时保证顶层文件依然存在
      expect(relativePaths).toContain("gui-mock-data-flow.md");
    });

    it("子目录中文件的内容应被正确读取", async () => {
      const parser = new MemoryParser({ basePath: tmpDir });
      const entries = await parser.readMemoryContent(
        DEFAULT_SESSION_IDS.REPO,
        WORKSPACE_ID,
      );
      const deep = entries.find((e) => e.relativePath === "notes/deep/deep.md");
      expect(deep).toBeDefined();
      expect(deep!.content).toContain("更深层的文件");
      expect(path.isAbsolute(deep!.sourceFile)).toBe(true);
    });

    it("countFiles（经 getSessionsByWorkspace 的 entryCount）应递归统计子目录中的文件", async () => {
      const parser = new MemoryParser({ basePath: tmpDir });
      const sessions = await parser.getSessionsByWorkspace(WORKSPACE_ID);
      const repoSession = sessions.find((s) => s.isRepo === true);
      // repo 根目录下原本 2 个 .md，加上 notes/nested.md 和 notes/deep/deep.md = 4
      expect(repoSession!.entryCount).toBe(4);
    });
  });
});

// =========================================================================
// scanCurrentWorkspace
// =========================================================================
describe("MemoryParser.scanCurrentWorkspace", () => {
  it("设置 currentWorkspaceId 后应只扫描该工作区", async () => {
    const parser = new MemoryParser({
      basePath: tmpDir,
      currentWorkspaceId: WORKSPACE_ID,
    });
    const workspaces = await parser.scanCurrentWorkspace();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].id).toBe(WORKSPACE_ID);
  });

  it("未设置 currentWorkspaceId 时应返回空数组", async () => {
    const parser = new MemoryParser({ basePath: tmpDir });
    const workspaces = await parser.scanCurrentWorkspace();
    expect(workspaces).toHaveLength(0);
  });
});

// =========================================================================
// setBasePath（向后兼容）
// =========================================================================
describe("MemoryParser.setBasePath", () => {
  it("setBasePath 后应能扫描新路径", async () => {
    // 创建一个新的目录结构
    const newTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-parser-new-"));
    const wsDir = path.join(newTmpDir, "aabbccdd11223344aabbccdd11223344");
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(
      path.join(wsDir, "workspace.json"),
      JSON.stringify({ folder: "file:///tmp/other-workspace" }),
      "utf8"
    );
    const memoriesDir = path.join(wsDir, "GitHub.copilot-chat", "memory-tool", "memories");
    fs.mkdirSync(memoriesDir, { recursive: true });

    const parser = new MemoryParser({ basePath: tmpDir });
    parser.setBasePath(newTmpDir);

    const workspaces = await parser.scanWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe("other-workspace");

    fs.rmSync(newTmpDir, { recursive: true, force: true });
  });
});
