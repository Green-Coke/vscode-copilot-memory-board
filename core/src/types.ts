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
  /**
   * ISO 8601 timestamp of the repository creation.
   * In the extension, derived from the memory directory folder's filesystem
   * creation time (birthtime, falling back to ctime/mtime when absent).
   */
  createdAt: string;
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

// ---------------------------------------------------------------------------
// 列表项排序相关类型
// ---------------------------------------------------------------------------

/**
 * 列表排序字段
 * - "name"：文件名 / 仓库名 / session 标题
 * - "createdAt"：创建时间（仓库对应记忆目录 createdAt，session 对应 createdAt）
 * - "updatedAt"：更新时间（仅在文件树中可用，mock 阶段提供）
 */
export type SortBy = "name" | "createdAt" | "updatedAt";

/**
 * 排序方向：asc 升序，desc 降序
 */
export type SortDirection = "asc" | "desc";

/**
 * 钉选项类型：repo 为仓库，session 为会话
 */
export type PinnedItemType = "repo" | "session";

/**
 * 用于列表选项（仓库 / session / 文件树节点）的统一排序描述
 */
export interface SortOption {
  /** 排序字段 */
  by: SortBy;
  /** 排序方向 */
  direction: SortDirection;
}

/**
 * UI 偏好（跨工作区的全局偏好）
 */
export interface UiPreferences {
  /** 是否启用文件预览能力 */
  enableFilePreview: boolean;
}

/**
 * 默认 UI 偏好：预览默认开启
 */
export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  enableFilePreview: true,
};

/**
 * 工作区级偏好的默认排序：列表默认按名称升序，文件树默认按名称升序
 */
export const DEFAULT_LIST_SORT: SortOption = {
  by: "name",
  direction: "asc",
};

/**
 * 工作区级持久化数据结构
 * 按工作区保存排序与钉选集合
 */
export interface WorkspaceState {
  /** 仓库列表排序 */
  repoSort: SortOption;
  /** session 列表排序 */
  sessionSort: SortOption;
  /** 文件树排序 */
  fileTreeSort: SortOption;
  /** 当前是否展开预览面板（仅在 enableFilePreview 为 true 时生效） */
  previewVisible: boolean;
  /** 已钉选的仓库 ID 集合 */
  pinnedRepoIds: string[];
  /** 已钉选的 session ID 集合 */
  pinnedSessionIds: string[];
}

/**
 * 默认工作区状态
 */
export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  repoSort: { ...DEFAULT_LIST_SORT },
  sessionSort: { ...DEFAULT_LIST_SORT },
  fileTreeSort: { ...DEFAULT_LIST_SORT },
  previewVisible: true,
  pinnedRepoIds: [],
  pinnedSessionIds: [],
};
