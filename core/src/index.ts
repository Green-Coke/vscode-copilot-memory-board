// ============================================================================
// @memory-board/core — Public API
// ============================================================================
// Barrel export for all public types, classes, and utilities.
// ============================================================================

// Domain Types
export type {
  Repository,
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
} from "./types.js";

// Protocol Types
export type {
  BaseMessage,
  RequestMessage,
  ResponseMessage,
  GetReposRequest,
  GetReposResponse,
  GetSessionsByRepoRequest,
  GetSessionsByRepoResponse,
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
  ReposChangedPush,
  AnyRequest,
  AnyResponse,
  AnyPushMessage,
} from "./protocol.js";

// Protocol Utilities
export { MessageTypes, generateRequestId } from "./protocol.js";

// Core Classes
export { MemoryParser } from "./memory-parser.js";
