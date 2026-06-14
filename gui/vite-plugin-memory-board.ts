// ============================================================================
// vite-plugin-memory-board — Standalone 模式下用 Vite dev server 读取真实磁盘
// ============================================================================
// 浏览器无法直接访问 fs。本插件在 vite dev server 上挂一组 HTTP 端点，
// 内部用 core 的 MemoryParser 扫描 workspaceStorage 真实目录。
//
// URL 约定（与 bridge.ts standalone 分支对应）：
//   GET /api/__memory_board/workspaces?insiders=false
//   GET /api/__memory_board/workspaces/:id/sessions
//   GET /api/__memory_board/workspaces/:id/sessions/:sessionId/memory
//
// 默认扫描路径探测：
//   - Windows:  %APPDATA%/Code/User/workspaceStorage (stable)
//                %APPDATA%/Code - Insiders/User/workspaceStorage (insiders)
//   - macOS:    ~/Library/Application Support/Code/User/workspaceStorage
//   - Linux:    ~/.config/Code/User/workspaceStorage
//
// 覆盖：
//   - 环境变量 MEMORY_BOARD_WS_STORAGE_OVERRIDE 优先（用于 e2e 注入 tmpdir fixture）
//   - URL query ?override=<path> 次优（用于运行时切换）
// ============================================================================

import type { Plugin } from "vite";
import * as path from "path";
import * as os from "os";
import { MemoryParser } from "@memory-board/core";

const API_PREFIX = "/api/__memory_board";

/**
 * 探测默认的 workspaceStorage 根路径。
 *
 * @param insiders 是否选用 Insiders 路径
 * @returns 绝对路径，未找到时返回 null
 */
function detectWorkspaceStorageBase(insiders: boolean): string | null {
  // 1) 环境变量优先（便于 e2e 注入 fixture、CI 注入伪磁盘）
  const envOverride = process.env["MEMORY_BOARD_WS_STORAGE_OVERRIDE"];
  if (envOverride && envOverride.trim().length > 0) {
    return envOverride;
  }

  const home = os.homedir();
  const platform = process.platform;

  // 应用名（区分 stable / insiders）
  const appName = insiders ? "Code - Insiders" : "Code";

  // macOS 上 process.env.APPDATA 不存在
  let segments: string[];
  if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (!appData) return null;
    segments = [appData, appName, "User", "workspaceStorage"];
  } else if (platform === "darwin") {
    segments = [home, "Library", "Application Support", appName, "User", "workspaceStorage"];
  } else {
    // Linux / 其他 POSIX
    segments = [home, ".config", appName, "User", "workspaceStorage"];
  }

  return path.join(...segments);
}

interface ParsedApiUrl {
  ok: boolean;
  basePath?: string;
  workspaceId?: string;
  sessionId?: string;
}

/**
 * 把 /api/__memory_board/... 的 URL 解析成数据路径参数。
 * 同时探测 insiders 与 override query。
 */
function parseApiUrl(urlPath: string, query: URLSearchParams): ParsedApiUrl {
  if (!urlPath.startsWith(API_PREFIX)) {
    return { ok: false };
  }

  // insiders 切换：?insiders=true
  const insiders = query.get("insiders") === "true";
  // 临时覆盖：?override=<abs path>
  const override = query.get("override");
  const basePath = override ?? detectWorkspaceStorageBase(insiders);
  if (!basePath) {
    return { ok: false };
  }

  // 去掉前缀，按 / 拆段
  const rest = urlPath.slice(API_PREFIX.length).replace(/^\/+|\/+$/g, "");
  const segments = rest.length > 0 ? rest.split("/") : [];

  // GET /workspaces
  if (segments.length === 1 && segments[0] === "workspaces") {
    return { ok: true, basePath };
  }
  // GET /workspaces/:id/sessions
  if (segments.length === 3 && segments[0] === "workspaces" && segments[2] === "sessions") {
    return { ok: true, basePath, workspaceId: decodeURIComponent(segments[1]) };
  }
  // GET /workspaces/:id/sessions/:sessionId/memory
  if (
    segments.length === 5 &&
    segments[0] === "workspaces" &&
    segments[2] === "sessions" &&
    segments[4] === "memory"
  ) {
    return {
      ok: true,
      basePath,
      workspaceId: decodeURIComponent(segments[1]),
      sessionId: decodeURIComponent(segments[3]),
    };
  }

  return { ok: false };
}

/**
 * 处理中间件收到的请求；返回 JSON 内容或抛错。
 */
async function handleApiRequest(
  parsed: ParsedApiUrl,
  query: URLSearchParams
): Promise<unknown> {
  const parser = new MemoryParser({
    basePath: parsed.basePath!,
    metadataBasePath: parsed.basePath!,
  });

  // GET /workspaces
  if (parsed.workspaceId === undefined) {
    const workspaces = await parser.scanWorkspaces();
    return { workspaces };
  }

  // GET /workspaces/:id/sessions/:sessionId/memory
  if (parsed.sessionId !== undefined) {
    const entries = await parser.readMemoryContent(parsed.sessionId, parsed.workspaceId);
    return { entries };
  }

  // GET /workspaces/:id/sessions
  const sessions = await parser.getSessionsByWorkspace(parsed.workspaceId);
  return { sessions };
}

/**
 * Vite 插件：standalone 模式下让 dev server 读真实磁盘。
 *
 * 仅在 `vite dev` 时生效；`vite build` 阶段不挂中间件，因此静态构建
 * 后的网页无法读盘（这与「production standalone build 仅 UI」的设定一致）。
 */
export function memoryBoardDevPlugin(): Plugin {
  return {
    name: "memory-board-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        // 只处理 API 前缀
        if (!url.startsWith(API_PREFIX)) {
          return next();
        }

        // 拆 query
        const urlObj = (() => {
          try {
            return new URL(url, "http://localhost");
          } catch {
            return null;
          }
        })();
        if (!urlObj) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Invalid URL" }));
          return;
        }

        const parsed = parseApiUrl(urlObj.pathname, urlObj.searchParams);
        if (!parsed.ok || !parsed.basePath) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "Unknown endpoint or storage path" }));
          return;
        }

        try {
          const result = await handleApiRequest(parsed, urlObj.searchParams);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      });
    },
  };
}
