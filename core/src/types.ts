// ============================================================================
// @memory-board/core — Type Definitions
// ============================================================================
// All core domain types used across the project.
// These types are shared between the core, gui, and extension packages.
// ============================================================================

/**
 * Represents a scanned repository containing Copilot memory data.
 */
export interface Repository {
  /** Unique identifier for the repository */
  id: string;
  /** Human-readable repository name */
  name: string;
  /** Absolute filesystem path to the repository's memory directory */
  path: string;
  /** Number of sessions found in this repository */
  sessionCount: number;
  /** ISO 8601 timestamp of the last modification */
  lastModified: string;
}

/**
 * Represents a single conversation session within a repository.
 */
export interface Session {
  /** Unique identifier for the session */
  id: string;
  /** Parent repository ID */
  repoId: string;
  /** Human-readable session title */
  title: string;
  /** ISO 8601 timestamp of session creation */
  createdAt: string;
  /** Number of memory entries in this session */
  entryCount: number;
}

/**
 * Represents a single memory entry (a piece of remembered context).
 */
export interface MemoryEntry {
  /** Unique identifier for the entry */
  id: string;
  /** Parent session ID */
  sessionId: string;
  /** The actual memory content text */
  content: string;
  /** Category classification of the memory */
  category: MemoryCategory;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Original source file name */
  sourceFile: string;
}

/**
 * Known categories for memory entries.
 */
export type MemoryCategory =
  | "preference"
  | "context"
  | "instruction"
  | "knowledge"
  | "pattern"
  | "unknown";
