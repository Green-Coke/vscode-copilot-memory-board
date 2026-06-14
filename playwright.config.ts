import { defineConfig, devices } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// 构造 E2E 专用的临时 mock 数据目录，避免因不同执行环境的真实 workspaceStorage 差异导致测试失败
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-board-e2e-"));
const WORKSPACE_ID = "cd816c4554674166c9322bed2e4c5f6d";
const TEST_SESSION_UUID = "2e4d6241-af91-48d3-9252-e311ba1ce135";
const TEST_SESSION_B64 = Buffer.from(TEST_SESSION_UUID).toString("base64");

// 1. 创建工作区基础结构
const wsDir = path.join(tmpDir, WORKSPACE_ID);
fs.mkdirSync(wsDir, { recursive: true });
fs.writeFileSync(
  path.join(wsDir, "workspace.json"),
  JSON.stringify({ folder: "file:///e%3A/projects/vscode-copilot-memory-board" }),
  "utf8"
);

// 2. 创建 memories 缓存与工作区级目录 repo
const memoriesDir = path.join(wsDir, "GitHub.copilot-chat", "memory-tool", "memories");
fs.mkdirSync(memoriesDir, { recursive: true });
const repoDir = path.join(memoriesDir, "repo");
fs.mkdirSync(repoDir, { recursive: true });
fs.writeFileSync(path.join(repoDir, "dummy.md"), "# Dummy Repo file", "utf8");

// 3. 创建测试会话，并生成包含 Header.tsx 与 public 文件夹的目录结构
const sessionDir = path.join(memoriesDir, TEST_SESSION_B64);
fs.mkdirSync(sessionDir, { recursive: true });
fs.writeFileSync(path.join(sessionDir, "Header.tsx"), "// Header component\nimport React from 'react';", "utf8");
const publicDir = path.join(sessionDir, "public");
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, "style.css"), "/* style */", "utf8");

// 4. 创建 chatSessions 元数据文件
const chatSessionsDir = path.join(wsDir, "chatSessions");
fs.mkdirSync(chatSessionsDir, { recursive: true });
const jsonlContent = [
  JSON.stringify({
    kind: 0,
    v: { version: 3, creationDate: 1781351206380, sessionId: TEST_SESSION_UUID, requests: [] },
  }),
  JSON.stringify({ kind: 1, k: ["customTitle"], v: "VS Code 插件配色同步" }),
].join("\n");
fs.writeFileSync(path.join(chatSessionsDir, `${TEST_SESSION_UUID}.jsonl`), jsonlContent, "utf8");

// 5. 设置环境变量使 Dev Server 和 Playwright 子进程引用该路径
process.env["MEMORY_BOARD_WS_STORAGE_OVERRIDE"] = tmpDir;

/**
 * Playwright 配置：用于验证 Memory Board GUI 的关键交互，依赖视觉判断的程度最小。
 *
 * 用例通过 data-testid 锚点断言 DOM/状态，不依赖截图对比，便于无视觉能力的执行模型验证。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node gui/node_modules/vite/bin/vite.js gui --port 5175 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
