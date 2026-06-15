// ============================================================================
// Bridge — Environment-Agnostic Message Transport
// ============================================================================
// Provides a unified API for sending requests and receiving responses
// between the GUI and the host environment.
//
// 两种真实运行时通道（standalone 模式不再有 mock 分支）：
//   - VS Code Webview → postMessage 到 extension host
//   - Standalone 浏览器 → fetch 到 Vite dev server 中间件 /api/__memory_board/*
//
// 单纯 UI 偏好 / 工作区状态的持久化（localStorage）在 standalone 下保留；
// 状态协议、openFile 等在 standalone 下走特定回退逻辑。
// ============================================================================

import type {
  AnyRequest,
  AnyPushMessage,
  ResponseMessage,
  UiPreferences,
  WorkspaceState,
} from "@memory-board/core";
import {
  generateRequestId,
  DEFAULT_UI_PREFERENCES,
  DEFAULT_WORKSPACE_STATE,
} from "@memory-board/core";

// ---------------------------------------------------------------------------
// Environment Detection
// ---------------------------------------------------------------------------

type BridgeEnvironment = "vscode" | "electron" | "standalone";

function detectEnvironment(): BridgeEnvironment {
  // Check for VS Code webview API
  if (typeof acquireVsCodeApi === "function") {
    return "vscode";
  }
  // Future: check for Electron IPC
  // if (typeof window !== "undefined" && (window as any).electronAPI) {
  //   return "electron";
  // }
  return "standalone";
}

// ---------------------------------------------------------------------------
// VS Code API Singleton
// ---------------------------------------------------------------------------

let vsCodeApiInstance: VsCodeApi | null = null;

function getVsCodeApi(): VsCodeApi {
  if (!vsCodeApiInstance) {
    vsCodeApiInstance = acquireVsCodeApi();
  }
  return vsCodeApiInstance;
}

// ---------------------------------------------------------------------------
// Pending Request Tracking
// ---------------------------------------------------------------------------

type PendingResolver = {
  resolve: (value: ResponseMessage) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<string, PendingResolver>();

/** Default timeout for a request (ms) */
const REQUEST_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Push Message Listeners
// ---------------------------------------------------------------------------

type PushListener = (message: AnyPushMessage) => void;
const pushListeners = new Set<PushListener>();

// ---------------------------------------------------------------------------
// Message Handler (incoming from Host)
// ---------------------------------------------------------------------------

function handleIncomingMessage(event: MessageEvent): void {
  const message = event.data as ResponseMessage | AnyPushMessage;

  if (!message || typeof message.type !== "string") {
    return;
  }

  // Check if this is a response to a pending request
  if (message.requestId && pendingRequests.has(message.requestId)) {
    const pending = pendingRequests.get(message.requestId)!;
    clearTimeout(pending.timer);
    pendingRequests.delete(message.requestId);
    pending.resolve(message as ResponseMessage);
    return;
  }

  // Otherwise treat as a push message
  for (const listener of pushListeners) {
    try {
      listener(message as AnyPushMessage);
    } catch (err) {
      console.error("[Bridge] Push listener error:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Standalone 模式下 UI 偏好与工作区状态的 localStorage 持久化
// ---------------------------------------------------------------------------

/**
 * 全局 UI 偏好的 localStorage key
 * 预览总开关属于跨工作区偏好，所以放在全局 key 下
 */
const UI_PREFERENCES_STORAGE_KEY = "memory-board:ui-preferences";

/**
 * 工作区状态的 localStorage key
 * standalone 没有真实 workspace 概念，这里统一存当前应用实例
 * 后续若引入 workspace/repo 维度隔离，可在 key 中追加后缀
 */
const WORKSPACE_STATE_STORAGE_KEY = "memory-board:workspace-state";

/**
 * Standalone 模式下扫描目标选择（stable / insiders）的 localStorage key
 * 仅 standalone 模式生效；VS Code 模式直接走真实 storageUri，不需要此选项。
 */
const SCAN_TARGET_STORAGE_KEY = "memory-board:scan-target";

/**
 * Standalone 模式下，用户选择的扫描目标（点击 Layout 中的切换按钮时更新）。
 * 'stable' = Code；'insiders' = Code - Insiders。
 */
export type ScanTarget = "stable" | "insiders";

export function readScanTarget(): ScanTarget {
  try {
    const raw = localStorage.getItem(SCAN_TARGET_STORAGE_KEY);
    return raw === "insiders" ? "insiders" : "stable";
  } catch {
    return "stable";
  }
}

export function writeScanTarget(target: ScanTarget): void {
  try {
    localStorage.setItem(SCAN_TARGET_STORAGE_KEY, target);
  } catch (err) {
    console.warn("[Bridge] 写入 scanTarget 失败:", err);
  }
}

/**
 * 深合并部分字段到目标对象，用于 Partial<WorkspaceState> 合并
 * 仅处理一层字段，嵌套对象（如 SortOption）整体覆盖即可
 */
function mergePartialWorkspaceState(
  base: WorkspaceState,
  patch: Partial<WorkspaceState>
): WorkspaceState {
  return {
    ...base,
    ...patch,
    workspaceSort: patch.workspaceSort ?? base.workspaceSort,
    sessionSort: patch.sessionSort ?? base.sessionSort,
    fileTreeSort: patch.fileTreeSort ?? base.fileTreeSort,
  };
}

/**
 * 读取全局 UI 偏好；缺失或损坏时返回默认值
 */
function readUiPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return { ...DEFAULT_UI_PREFERENCES, ...parsed };
  } catch (err) {
    console.warn("[Bridge] 读取 UI 偏好失败，回退默认值:", err);
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

/**
 * 写入全局 UI 偏好
 */
function writeUiPreferences(preferences: UiPreferences): void {
  try {
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch (err) {
    console.warn("[Bridge] 写入 UI 偏好失败:", err);
  }
}

/**
 * 读取工作区状态；缺失或损坏时返回默认值
 */
function readWorkspaceState(): WorkspaceState {
  try {
    const raw = localStorage.getItem(WORKSPACE_STATE_STORAGE_KEY);
    if (!raw) return cloneDefaultWorkspaceState();
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    return mergePartialWorkspaceState(cloneDefaultWorkspaceState(), parsed);
  } catch (err) {
    console.warn("[Bridge] 读取工作区状态失败，回退默认值:", err);
    return cloneDefaultWorkspaceState();
  }
}

/**
 * 写入工作区状态（整体覆盖）
 */
function writeWorkspaceState(state: WorkspaceState): void {
  try {
    localStorage.setItem(WORKSPACE_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[Bridge] 写入工作区状态失败:", err);
  }
}

/**
 * 复制默认工作区状态，避免外部意外修改常量默认值
 */
function cloneDefaultWorkspaceState(): WorkspaceState {
  return {
    workspaceSort: { ...DEFAULT_WORKSPACE_STATE.workspaceSort },
    sessionSort: { ...DEFAULT_WORKSPACE_STATE.sessionSort },
    fileTreeSort: { ...DEFAULT_WORKSPACE_STATE.fileTreeSort },
    previewVisible: DEFAULT_WORKSPACE_STATE.previewVisible,
    pinnedWorkspaceIds: [...DEFAULT_WORKSPACE_STATE.pinnedWorkspaceIds],
    pinnedSessionIds: [...DEFAULT_WORKSPACE_STATE.pinnedSessionIds],
    // 仅展示有记忆的工作区状态默认值
    onlyShowWithMemories: DEFAULT_WORKSPACE_STATE.onlyShowWithMemories,
    // 仅展示有条目的会话状态默认值
    onlyShowWithEntries: DEFAULT_WORKSPACE_STATE.onlyShowWithEntries,
  };
}

// ---------------------------------------------------------------------------
// Standalone 模式：通过 Vite dev server 中间件读真实磁盘
// ---------------------------------------------------------------------------
// 浏览器无法直接读 fs，所以 standalone 模式不再硬编码 mock 数据，
// 改为 fetch 到 vite-plugin-memory-board 暴露的 HTTP 端点。
// 端点路径与 URL query（insiders / override）见 vite-plugin-memory-board.ts。
//
// 仍然在 standalone 模式下保留的「本地通道」：
// - getUiPreferences / setUiPreferences → localStorage
// - getWorkspaceState / setWorkspaceState → localStorage
// - openFile：浏览器没有编辑器，直接 resolve 空成功
// ---------------------------------------------------------------------------

/** Vite 中间件暴露的 API 前缀（与 vite-plugin-memory-board 一致） */
const STANDALONE_API_PREFIX = "/api/__memory_board";

/**
 * 构造 standalone 模式下的 fetch URL；自动追加 insiders query。
 */
function buildStandaloneUrl(pathSegments: string[]): string {
  const target = readScanTarget();
  const joined = pathSegments.map(encodeURIComponent).join("/");
  const query = target === "insiders" ? "?insiders=true" : "";
  return `${STANDALONE_API_PREFIX}/${joined}${query}`;
}

/**
 * 在 standalone 模式下处理一条请求：要么走 HTTP fetch（数据型请求），
 * 要么走 localStorage（UI 偏好/工作区状态）、要么直接 resolve（openFile）。
 */
async function handleStandaloneRequest(
  request: AnyRequest
): Promise<ResponseMessage> {
  // 数据型请求走 fetch
  switch (request.type) {
    case "getWorkspaces": {
      try {
        const r = await fetch(buildStandaloneUrl(["workspaces"]));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const payload = (await r.json()) as { workspaces: unknown };
        return {
          type: "getWorkspaces",
          requestId: request.requestId,
          payload: payload as ResponseMessage["payload"],
          error: null,
        };
      } catch (err) {
        return {
          type: "getWorkspaces",
          requestId: request.requestId,
          payload: { workspaces: [] },
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    case "getSessionsByWorkspace": {
      const { workspaceId } = request.payload as { workspaceId: string };
      try {
        const r = await fetch(
          buildStandaloneUrl(["workspaces", workspaceId, "sessions"])
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const payload = (await r.json()) as { sessions: unknown };
        return {
          type: "getSessionsByWorkspace",
          requestId: request.requestId,
          payload: payload as ResponseMessage["payload"],
          error: null,
        };
      } catch (err) {
        return {
          type: "getSessionsByWorkspace",
          requestId: request.requestId,
          payload: { sessions: [] },
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    case "readMemoryContent": {
      const payload = request.payload as { sessionId: string; workspaceId?: string };
      // standalone 模式下 hook 通常不会带 workspaceId，扩展端 hook 会带 currentWorkspaceId；
      // 这里若无 workspaceId，浏览器可降级为查询前端缓存中 selectedWorkspace.id（bridge 已经tschaft 解耦），
      // 实际生产场景希望上层 hook 始终带上 workspaceId。
      if (!payload.workspaceId) {
        return {
          type: "readMemoryContent",
          requestId: request.requestId,
          payload: { entries: [] },
          error: null,
        };
      }
      try {
        const r = await fetch(
          buildStandaloneUrl([
            "workspaces",
            payload.workspaceId,
            "sessions",
            payload.sessionId,
            "memory",
          ])
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const resp = (await r.json()) as { entries: unknown };
        return {
          type: "readMemoryContent",
          requestId: request.requestId,
          payload: resp as ResponseMessage["payload"],
          error: null,
        };
      } catch (err) {
        return {
          type: "readMemoryContent",
          requestId: request.requestId,
          payload: { entries: [] },
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    case "getCurrentWorkspace": {
      // standalone 模式无「当前工作区」概念；返回 undefined，GUI 会回退到「显示工作区列表 / 自动选第一个」
      return {
        type: "getCurrentWorkspace",
        requestId: request.requestId,
        payload: {},
        error: null,
      };
    }
    case "getUiPreferences": {
      return {
        type: "getUiPreferences",
        requestId: request.requestId,
        payload: { preferences: readUiPreferences() },
        error: null,
      };
    }
    case "setUiPreferences": {
      const current = readUiPreferences();
      const next: UiPreferences = { ...current, ...request.payload.preferences };
      writeUiPreferences(next);
      return {
        type: "setUiPreferences",
        requestId: request.requestId,
        payload: { preferences: next },
        error: null,
      };
    }
    case "getWorkspaceState": {
      return {
        type: "getWorkspaceState",
        requestId: request.requestId,
        payload: { state: readWorkspaceState() },
        error: null,
      };
    }
    case "setWorkspaceState": {
      const current = readWorkspaceState();
      const next = mergePartialWorkspaceState(current, request.payload.state);
      writeWorkspaceState(next);
      return {
        type: "setWorkspaceState",
        requestId: request.requestId,
        payload: { state: next },
        error: null,
      };
    }
    case "openFile": {
      // 独立浏览器模式下不执行实际的文件打开操作，直接返回成功响应
      return {
        type: "openFile",
        requestId: request.requestId,
        payload: {},
        error: null,
      };
    }

    // 文件操作协议：standalone 模式不支持写操作，统一返回 not-implemented 错误
    case "copyEntries":
    case "moveEntries":
    case "renameEntry":
    case "deleteEntries":
    case "createDirectory":
    case "importExternalFile":
    case "revealInOs":
    case "copyPathToClipboard": {
      const fileOpReq = request as { type: string; requestId: string };
      return {
        type: fileOpReq.type,
        requestId: fileOpReq.requestId,
        payload: {},
        error: "Standalone 浏览器模式不支持文件写操作",
      };
    }
    case "readExternalClipboardFiles": {
      return {
        type: "readExternalClipboardFiles",
        requestId: request.requestId,
        payload: { paths: [], unsupported: true },
        error: null,
      };
    }
    default: {
      // TS 在 default 分支里会把 request 收缩为 never；这里手工安全以字符串提取 type
      const req = request as { type: string; requestId: string };
      return {
        type: req.type,
        requestId: req.requestId,
        payload: {},
        error: `Unknown message type: ${req.type}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Bridge Public API
// ---------------------------------------------------------------------------

let initialized = false;

/**
 * 在模块加载阶段即完成环境探测，以便 UI 组件在 App.initBridge() 之前
 * 调用 getBridgeEnvironment() 也能拿到正确结果（例如渲染分支决策）。
 */
let currentEnvironment: BridgeEnvironment =
  typeof acquireVsCodeApi === "function" ? "vscode" : detectEnvironment();

/**
 * Initialize the message bridge. Must be called once at app startup.
 */
export function initBridge(): BridgeEnvironment {
  if (initialized) return currentEnvironment;

  // 重新探测一次，确保 DOM 完全就绪后的环境仍然准确
  currentEnvironment = detectEnvironment();
  console.log(`[Bridge] Environment detected: ${currentEnvironment}`);

  // Register global message listener
  window.addEventListener("message", handleIncomingMessage);

  initialized = true;
  return currentEnvironment;
}

/**
 * Send a typed request to the host and await its response.
 */
export function sendRequest<T extends AnyRequest>(
  type: T["type"],
  payload: T["payload"]
): Promise<ResponseMessage> {
  const requestId = generateRequestId();
  const request = { type, requestId, payload } as AnyRequest;

  // In standalone mode, route through Vite dev server HTTP fetch
  if (currentEnvironment === "standalone") {
    return handleStandaloneRequest(request);
  }

  // In VS Code mode, post message to extension host
  return new Promise<ResponseMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Request timed out: ${type} (${requestId})`));
    }, REQUEST_TIMEOUT);

    pendingRequests.set(requestId, { resolve, reject, timer });

    if (currentEnvironment === "vscode") {
      getVsCodeApi().postMessage(request);
    }
    // Future: else if (currentEnvironment === "electron") { ... }
  });
}

/**
 * Register a listener for unsolicited push messages from the host.
 * Returns an unsubscribe function.
 */
export function onPushMessage(listener: PushListener): () => void {
  pushListeners.add(listener);
  return () => {
    pushListeners.delete(listener);
  };
}

/**
 * Get the current bridge environment.
 */
export function getBridgeEnvironment(): BridgeEnvironment {
  return currentEnvironment;
}

/**
 * Cleanup the bridge (for testing or hot-reload).
 */
export function destroyBridge(): void {
  window.removeEventListener("message", handleIncomingMessage);
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Bridge destroyed"));
  }
  pendingRequests.clear();
  pushListeners.clear();
  initialized = false;
  vsCodeApiInstance = null;
}

