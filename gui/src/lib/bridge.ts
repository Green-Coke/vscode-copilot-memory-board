// ============================================================================
// Bridge — Environment-Agnostic Message Transport
// ============================================================================
// Provides a unified API for sending requests and receiving responses
// between the GUI and the host environment. Automatically detects the
// runtime (VS Code Webview, Electron IPC, or standalone browser with mock).
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
  };
}

// ---------------------------------------------------------------------------
// Mock Data for Standalone Mode
// ---------------------------------------------------------------------------

async function handleMockRequest(
  request: AnyRequest
): Promise<ResponseMessage> {
  // Standalone 浏览器模式无法访问本地磁盘上的 Copilot 内存目录，
  // 因此这里直接返回内置的纯前端 mock 数据，让仓库 / 会话 / 文件树可被完整演示。
  const { MOCK_WORKSPACES, MOCK_SESSIONS, MOCK_ENTRIES } = await import(
    "@/lib/mock-data"
  );

  switch (request.type) {
    case "getWorkspaces": {
      return {
        type: "getWorkspaces",
        requestId: request.requestId,
        payload: { workspaces: MOCK_WORKSPACES },
        error: null,
      };
    }
    case "getSessionsByWorkspace": {
      const sessions = MOCK_SESSIONS.filter(
        (s) => s.workspaceId === request.payload.workspaceId
      );
      return {
        type: "getSessionsByWorkspace",
        requestId: request.requestId,
        payload: { sessions },
        error: null,
      };
    }
    case "readMemoryContent": {
      const entries = MOCK_ENTRIES.filter(
        (e) => e.sessionId === request.payload.sessionId
      );
      return {
        type: "readMemoryContent",
        requestId: request.requestId,
        payload: { entries },
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
      // mergePartial 后整体回写，保证新加字段不丢
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
    default: {
      const unknownRequest = request as AnyRequest;
      return {
        type: unknownRequest.type,
        requestId: unknownRequest.requestId,
        payload: {},
        error: `Unknown message type: ${unknownRequest.type}`,
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

  // In standalone mode, use mock handler
  if (currentEnvironment === "standalone") {
    return handleMockRequest(request);
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
