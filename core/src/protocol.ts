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
 * 复制文件/目录到目标文件夹的请求
 */
export interface CopyEntriesRequest {
  type: "copyEntries";
  requestId: string;
  payload: {
    /** 源文件/目录的绝对路径列表 */
    sourcePaths: string[];
    /** 目标文件夹的绝对路径 */
    targetDir: string;
  };
}

/**
 * 移动文件/目录到目标文件夹的请求
 */
export interface MoveEntriesRequest {
  type: "moveEntries";
  requestId: string;
  payload: {
    /** 源文件/目录的绝对路径列表 */
    sourcePaths: string[];
    /** 目标文件夹的绝对路径 */
    targetDir: string;
  };
}

/**
 * 重命名文件/目录的请求（仅同目录改名）
 */
export interface RenameEntryRequest {
  type: "renameEntry";
  requestId: string;
  payload: {
    /** 文件/目录的绝对路径 */
    path: string;
    /** 新名称（不含路径分隔符） */
    newName: string;
  };
}

/**
 * 删除文件/目录的请求
 */
export interface DeleteEntriesRequest {
  type: "deleteEntries";
  requestId: string;
  payload: {
    /** 要删除的文件/目录绝对路径列表 */
    paths: string[];
    /** 是否使用系统回收站 */
    useTrash: boolean;
  };
}

/**
 * 创建目录的请求
 */
export interface CreateDirectoryRequest {
  type: "createDirectory";
  requestId: string;
  payload: {
    /** 要创建的目录绝对路径 */
    path: string;
  };
}

/**
 * 导入外部文件（拖拽导入）的请求。
 * GUI 通过 HTML5 DataTransfer 读取文件内容后，以 base64 传给扩展端写入磁盘。
 */
export interface ImportExternalFileRequest {
  type: "importExternalFile";
  requestId: string;
  payload: {
    /** 目标目录绝对路径 */
    targetDir: string;
    /** 文件名 */
    name: string;
    /** 文件内容的 base64 编码 */
    contentBase64: string;
    /** 文件原始大小（字节），用于扩展端二次校验 30MB 上限 */
    sizeBytes: number;
  };
}

/**
 * 在系统资源管理器中显示文件/目录的请求
 */
export interface RevealInOsRequest {
  type: "revealInOs";
  requestId: string;
  payload: {
    /** 文件/目录的绝对路径 */
    path: string;
  };
}

/**
 * 复制文件路径到系统剪贴板的请求
 */
export interface CopyPathToClipboardRequest {
  type: "copyPathToClipboard";
  requestId: string;
  payload: {
    /** 文件/目录的绝对路径 */
    path: string;
    /** 是否为相对路径模式 */
    relative: boolean;
    /** 工作区 ID（计算相对路径时使用） */
    workspaceId?: string;
  };
}

/**
 * 读取系统剪贴板中文件列表的请求。
 * 用于实现"外部资源管理器复制文件 → 插件内粘贴"场景。
 * 仅 Windows 支持；macOS/Linux 返回 unsupported。
 */
export interface ReadExternalClipboardFilesRequest {
  type: "readExternalClipboardFiles";
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
  | GetCurrentWorkspaceRequest
  | CopyEntriesRequest
  | MoveEntriesRequest
  | RenameEntryRequest
  | DeleteEntriesRequest
  | CreateDirectoryRequest
  | ImportExternalFileRequest
  | RevealInOsRequest
  | CopyPathToClipboardRequest
  | ReadExternalClipboardFilesRequest;

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
 *
 * payload 扩展字段说明：
 * - preferences: 全局 UI 偏好（预览开关、IDE 重定向目标等）
 * - showRedirectSelector / isAgy: 派生 IDE 环境下是否展示 IDE 重定向选择器
 * - language: 扩展端运行时的显示语言（来自 vscode.env.language，如 "zh-cn"/"en"/"en-US"）。
 *             可选字段：扩展端始终注入；standalone 模式下不存在。
 *             用于 webview 端 i18n 选择合适的翻译资源。
 *             注意：VS Code 切换显示语言必然导致窗口重启、webview 重建，
 *             所以没有运行时语言变化事件——webview 初始化时读取一次即可。
 */
export interface GetUiPreferencesResponse {
  type: "getUiPreferences";
  requestId: string;
  payload: {
    preferences: UiPreferences;
    showRedirectSelector?: boolean;
    isAgy?: boolean;
    language?: string;
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
 * 复制文件/目录的响应
 */
export interface CopyEntriesResponse {
  type: "copyEntries";
  requestId: string;
  payload: Record<string, never>;
  error: string | null;
}

/**
 * 移动文件/目录的响应
 */
export interface MoveEntriesResponse {
  type: "moveEntries";
  requestId: string;
  payload: Record<string, never>;
  error: string | null;
}

/**
 * 重命名文件/目录的响应
 */
export interface RenameEntryResponse {
  type: "renameEntry";
  requestId: string;
  payload: Record<string, never>;
  error: string | null;
}

/**
 * 删除文件/目录的响应
 */
export interface DeleteEntriesResponse {
  type: "deleteEntries";
  requestId: string;
  payload: Record<string, never>;
  error: string | null;
}

/**
 * 创建目录的响应
 */
export interface CreateDirectoryResponse {
  type: "createDirectory";
  requestId: string;
  payload: Record<string, never>;
  error: string | null;
}

/**
 * 导入外部文件的响应
 */
export interface ImportExternalFileResponse {
  type: "importExternalFile";
  requestId: string;
  payload: Record<string, never>;
  error: string | null;
}

/**
 * 在系统资源管理器中显示的响应
 */
export interface RevealInOsResponse {
  type: "revealInOs";
  requestId: string;
  payload: Record<string, never>;
  error: string | null;
}

/**
 * 复制路径到剪贴板的响应
 */
export interface CopyPathToClipboardResponse {
  type: "copyPathToClipboard";
  requestId: string;
  payload: Record<string, never>;
  error: string | null;
}

/**
 * 读取系统剪贴板中文件列表的响应
 */
export interface ReadExternalClipboardFilesResponse {
  type: "readExternalClipboardFiles";
  requestId: string;
  payload: {
    /** 剪贴板中的文件绝对路径列表 */
    paths: string[];
    /** 当前平台是否不支持此功能 */
    unsupported?: boolean;
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
  | GetCurrentWorkspaceResponse
  | CopyEntriesResponse
  | MoveEntriesResponse
  | RenameEntryResponse
  | DeleteEntriesResponse
  | CreateDirectoryResponse
  | ImportExternalFileResponse
  | RevealInOsResponse
  | CopyPathToClipboardResponse
  | ReadExternalClipboardFilesResponse;

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
  // 文件操作协议
  COPY_ENTRIES: "copyEntries",
  MOVE_ENTRIES: "moveEntries",
  RENAME_ENTRY: "renameEntry",
  DELETE_ENTRIES: "deleteEntries",
  CREATE_DIRECTORY: "createDirectory",
  IMPORT_EXTERNAL_FILE: "importExternalFile",
  REVEAL_IN_OS: "revealInOs",
  COPY_PATH_TO_CLIPBOARD: "copyPathToClipboard",
  READ_EXTERNAL_CLIPBOARD_FILES: "readExternalClipboardFiles",
} as const;

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
