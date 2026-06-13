// ============================================================================
// @memory-board/core — Communication Protocol Types
// ============================================================================
// TypeScript type definitions for the postMessage protocol between
// the GUI (webview) and the host environment (VS Code extension / Electron).
// Must stay in sync with docs/protocol.md.
// ============================================================================

import type { MemoryEntry, Repository, Session } from "./types.js";

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

export interface GetReposRequest {
  type: "getRepos";
  requestId: string;
  payload: Record<string, never>;
}

export interface GetSessionsByRepoRequest {
  type: "getSessionsByRepo";
  requestId: string;
  payload: {
    repoId: string;
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
 * Union of all possible request message types.
 */
export type AnyRequest =
  | GetReposRequest
  | GetSessionsByRepoRequest
  | ReadMemoryContentRequest;

// ---------------------------------------------------------------------------
// Response Payloads (Host → GUI)
// ---------------------------------------------------------------------------

export interface GetReposResponse {
  type: "getRepos";
  requestId: string;
  payload: {
    repos: Repository[];
  };
  error: string | null;
}

export interface GetSessionsByRepoResponse {
  type: "getSessionsByRepo";
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
 * Union of all possible response message types.
 */
export type AnyResponse =
  | GetReposResponse
  | GetSessionsByRepoResponse
  | ReadMemoryContentResponse;

// ---------------------------------------------------------------------------
// Push Messages (Host → GUI, unsolicited)
// ---------------------------------------------------------------------------

export interface ReposChangedPush {
  type: "onReposChanged";
  requestId: "";
  payload: {
    repos: Repository[];
  };
  error: null;
}

/**
 * Union of all push message types.
 */
export type AnyPushMessage = ReposChangedPush;

// ---------------------------------------------------------------------------
// Message Type Helpers
// ---------------------------------------------------------------------------

/**
 * All known message type strings.
 */
export const MessageTypes = {
  GET_REPOS: "getRepos",
  GET_SESSIONS_BY_REPO: "getSessionsByRepo",
  READ_MEMORY_CONTENT: "readMemoryContent",
  ON_REPOS_CHANGED: "onReposChanged",
} as const;

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
