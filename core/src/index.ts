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
  ReposChangedPush,
  AnyRequest,
  AnyResponse,
  AnyPushMessage,
} from "./protocol.js";

// Protocol Utilities
export { MessageTypes, generateRequestId } from "./protocol.js";

// Core Classes
export { MemoryParser } from "./memory-parser.js";
