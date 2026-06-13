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
} from "@memory-board/core";
import { generateRequestId } from "@memory-board/core";

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
// Mock Data for Standalone Mode
// ---------------------------------------------------------------------------

async function handleMockRequest(
  request: AnyRequest
): Promise<ResponseMessage> {
  // Standalone 浏览器模式无法访问本地磁盘上的 Copilot 内存目录，
  // 因此这里直接返回内置的纯前端 mock 数据，让仓库 / 会话 / 文件树可被完整演示。
  const { MOCK_REPOS, MOCK_SESSIONS, MOCK_ENTRIES } = await import(
    "@/lib/mock-data"
  );

  switch (request.type) {
    case "getRepos": {
      return {
        type: "getRepos",
        requestId: request.requestId,
        payload: { repos: MOCK_REPOS },
        error: null,
      };
    }
    case "getSessionsByRepo": {
      const sessions = MOCK_SESSIONS.filter(
        (s) => s.repoId === request.payload.repoId
      );
      return {
        type: "getSessionsByRepo",
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
let currentEnvironment: BridgeEnvironment = "standalone";

/**
 * Initialize the message bridge. Must be called once at app startup.
 */
export function initBridge(): BridgeEnvironment {
  if (initialized) return currentEnvironment;

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
