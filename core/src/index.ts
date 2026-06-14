// ============================================================================
// @memory-board/core — Public API
// ============================================================================
// Barrel export for all public types, classes, and utilities.
// ============================================================================

// Domain Types
export type {
  Workspace,
  Session,
  MemoryEntry,
  MemoryCategory,
  SortBy,
  SortDirection,
  PinnedItemType,
  SortOption,
  UiPreferences,
  WorkspaceState,
} from "./types.js";

export {
  DEFAULT_UI_PREFERENCES,
  DEFAULT_LIST_SORT,
  DEFAULT_WORKSPACE_STATE,
  DEFAULT_SESSION_IDS,
} from "./types.js";

// Protocol Types
export type {
  BaseMessage,
  RequestMessage,
  ResponseMessage,
  GetWorkspacesRequest,
  GetWorkspacesResponse,
  GetSessionsByWorkspaceRequest,
  GetSessionsByWorkspaceResponse,
  ReadMemoryContentRequest,
  ReadMemoryContentResponse,
  GetUiPreferencesRequest,
  GetUiPreferencesResponse,
  SetUiPreferencesRequest,
  SetUiPreferencesResponse,
  GetWorkspaceStateRequest,
  GetWorkspaceStateResponse,
  SetWorkspaceStateRequest,
  SetWorkspaceStateResponse,
  WorkspacesChangedPush,
  AnyRequest,
  AnyResponse,
  AnyPushMessage,
  OpenFileRequest,
  OpenFileResponse,
} from "./protocol.js";

// Protocol Utilities
export { MessageTypes, generateRequestId } from "./protocol.js";

// Core Classes
export { MemoryParser } from "./memory-parser.js";
export type { MemoryParserOptions } from "./memory-parser.js";
export { parseChatSessionJsonl } from "./session-jsonl-parser.js";
export type { ParsedChatSession } from "./session-jsonl-parser.js";
