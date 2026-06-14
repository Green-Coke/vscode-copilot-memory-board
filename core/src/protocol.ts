// ============================================================================
// @memory-board/core — Communication Protocol Types
// ============================================================================
// TypeScript type definitions for the postMessage protocol between
// the GUI (webview) and the host environment (VS Code extension / Electron).
// Must stay in sync with docs/protocol.md.
// ============================================================================

import type { MemoryEntry, Session, UiPreferences, Workspace, WorkspaceState } from "./types.js";

// ---------------------------------------------------------------------------
// Envelope Types
// ---------------------------------------------------------------------------

/**
 * Base shape for all messages flowing through the bridge.
 */
export interface BaseMessage {
  /** Message type identifier */
  type: string;
  /** Unique request ID for correlating request/response pairs */
  requestId: string;
}

/**
 * A request message sent from GUI → Host.
 */
export interface RequestMessage<T = Record<string, unknown>>
  extends BaseMessage {
  /** Request payload, varies by message type */
  payload: T;
}

/**
 * A response message sent from Host → GUI.
 */
export interface ResponseMessage<T = Record<string, unknown>>
  extends BaseMessage {
  /** Response payload */
  payload: T;
  /** Error message string, null on success */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Request Payloads (GUI → Host)
// ---------------------------------------------------------------------------

export interface GetWorkspacesRequest {
  type: "getWorkspaces";
  requestId: string;
  payload: Record<string, never>;
}

export interface GetSessionsByWorkspaceRequest {
  type: "getSessionsByWorkspace";
  requestId: string;
  payload: {
    workspaceId: string;
  };
}

export interface ReadMemoryContentRequest {
  type: "readMemoryContent";
  requestId: string;
  payload: {
    sessionId: string;
  };
}

/**
 * 读取 UI 偏好请求（全局偏好，如预览总开关）
 */
export interface GetUiPreferencesRequest {
  type: "getUiPreferences";
  requestId: string;
  payload: Record<string, never>;
}

/**
 * 写入 UI 偏好请求（全局偏好）
 */
export interface SetUiPreferencesRequest {
  type: "setUiPreferences";
  requestId: string;
  payload: {
    preferences: Partial<UiPreferences>;
  };
}

/**
 * 读取工作区状态请求（排序、钉选等)
 */
export interface GetWorkspaceStateRequest {
  type: "getWorkspaceState";
  requestId: string;
  payload: Record<string, never>;
}

/**
 * 写入工作区状态请求（排序、钉选等）
 * 写入会整体覆盖对应字段，调用方需先读取再 merge
 */
export interface SetWorkspaceStateRequest {
  type: "setWorkspaceState";
  requestId: string;
  payload: {
    state: Partial<WorkspaceState>;
  };
}

/**
 * 在 VS Code 编辑器中打开文件的请求
 */
export interface OpenFileRequest {
  type: "openFile";
  requestId: string;
  payload: {
    /** 文件名 */
    name: string;
    /** 文件内容（在 Untitled 模式下初始化使用） */
    content: string;
    /** 文件类型描述 */
    fileType: string;
    /** 真实的文件物理路径（如果存在的话） */
    path?: string;
  };
}

/**
 * 获取“当前激活工作区请求” 。
 * 扩展端运行时仅 VS Code 有活跨的“当前工作区”概念；standalone 网页返回 null。
 * 响应 payload workspace 可能是 undefined（表示未在 workspace 内打开扩展 / standalone 模式）。
 */
export interface GetCurrentWorkspaceRequest {
  type: "getCurrentWorkspace";
  requestId: string;
  payload: Record<string, never>;
}

/**
 * Union of all possible request message types.
 */
export type AnyRequest =
  | GetWorkspacesRequest
  | GetSessionsByWorkspaceRequest
  | ReadMemoryContentRequest
  | GetUiPreferencesRequest
  | SetUiPreferencesRequest
  | GetWorkspaceStateRequest
  | SetWorkspaceStateRequest
  | OpenFileRequest
  | GetCurrentWorkspaceRequest;

// ---------------------------------------------------------------------------
// Response Payloads (Host → GUI)
// ---------------------------------------------------------------------------

export interface GetWorkspacesResponse {
  type: "getWorkspaces";
  requestId: string;
  payload: {
    workspaces: Workspace[];
  };
  error: string | null;
}

export interface GetSessionsByWorkspaceResponse {
  type: "getSessionsByWorkspace";
  requestId: string;
  payload: {
    sessions: Session[];
  };
  error: string | null;
}

export interface ReadMemoryContentResponse {
  type: "readMemoryContent";
  requestId: string;
  payload: {
    entries: MemoryEntry[];
  };
  error: string | null;
}

/**
 * 读取 UI 偏好响应
 */
export interface GetUiPreferencesResponse {
  type: "getUiPreferences";
  requestId: string;
  payload: {
    preferences: UiPreferences;
  };
  error: string | null;
}

/**
 * 写入 UI 偏好响应
 */
export interface SetUiPreferencesResponse {
  type: "setUiPreferences";
  requestId: string;
  payload: {
    preferences: UiPreferences;
  };
  error: string | null;
}

/**
 * 读取工作区状态响应
 */
export interface GetWorkspaceStateResponse {
  type: "getWorkspaceState";
  requestId: string;
  payload: {
    state: WorkspaceState;
  };
  error: string | null;
}

/**
 * 写入工作区状态响应
 */
export interface SetWorkspaceStateResponse {
  type: "setWorkspaceState";
  requestId: string;
  payload: {
    state: WorkspaceState;
  };
  error: string | null;
}

/**
 * 在 VS Code 编辑器中打开文件的响应
 */
export interface OpenFileResponse {
  type: "openFile";
  requestId: string;
  payload: Record<string, never>;
  error: string | null;
}

/**
 * “当前激活工作区”响应。
 * workspace===undefined 表示未检测到当前工作区（standalone / 无 storageUri）。
 */
export interface GetCurrentWorkspaceResponse {
  type: "getCurrentWorkspace";
  requestId: string;
  payload: {
    workspace?: Workspace;
  };
  error: string | null;
}

/**
 * Union of all possible response message types.
 */
export type AnyResponse =
  | GetWorkspacesResponse
  | GetSessionsByWorkspaceResponse
  | ReadMemoryContentResponse
  | GetUiPreferencesResponse
  | SetUiPreferencesResponse
  | GetWorkspaceStateResponse
  | SetWorkspaceStateResponse
  | OpenFileResponse
  | GetCurrentWorkspaceResponse;

// ---------------------------------------------------------------------------
// Push Messages (Host → GUI, unsolicited)
// ---------------------------------------------------------------------------

export interface WorkspacesChangedPush {
  type: "onWorkspacesChanged";
  requestId: "";
  payload: {
    workspaces: Workspace[];
  };
  error: null;
}

/**
 * Union of all push message types.
 */
export type AnyPushMessage = WorkspacesChangedPush;

// ---------------------------------------------------------------------------
// Message Type Helpers
// ---------------------------------------------------------------------------

/**
 * All known message type strings.
 */
export const MessageTypes = {
  GET_WORKSPACES: "getWorkspaces",
  GET_SESSIONS_BY_WORKSPACE: "getSessionsByWorkspace",
  READ_MEMORY_CONTENT: "readMemoryContent",
  GET_UI_PREFERENCES: "getUiPreferences",
  SET_UI_PREFERENCES: "setUiPreferences",
  GET_WORKSPACE_STATE: "getWorkspaceState",
  SET_WORKSPACE_STATE: "setWorkspaceState",
  ON_WORKSPACES_CHANGED: "onWorkspacesChanged",
  OPEN_FILE: "openFile",
  GET_CURRENT_WORKSPACE: "getCurrentWorkspace",
} as const;

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
