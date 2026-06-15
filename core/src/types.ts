// ============================================================================
// @memory-board/core — Type Definitions
// ============================================================================
// All core domain types used across the project.
// These types are shared between the core, gui, and extension packages.
// ============================================================================

/**
 * 表示一个被扫描到的 VS Code 工作区。
 *
 * 在实际存储模型里，1 个 workspace 等价于 workspaceStorage/<workspaceId> 目录，
 * 该目录下若存在 GitHub.copilot-chat/memory-tool/memories 子目录则视为"有记忆数据"。
 */
export interface Workspace {
  /** 工作区唯一标识符（workspaceStorage 下 the MD5 hex 目录名） */
  id: string;
  /** 人类可读的工作区名称（从 workspace.json 的 folder URI 解码出 basename） */
  name: string;
  /** 该工作区对应的真实磁盘根路径（folder URI 解码后的路径） */
  path: string;
  /** 该工作区下的 session 总数（包含组建的"工作区级目录"特殊 session） */
  sessionCount: number;
  /** 最近一次修改时间（ISO 8601） */
  lastModified: string;
  /**
   * 创建时间（ISO 8601）。
   * 真实实现中由 memories 目录的 fs birthtime/ctime 推导。
   */
  createdAt: string;
  /**
   * 该工作区在本地对应的 workspaceStorage 目录的物理绝对路径（可选）。
   */
  storagePath?: string;
}

/**
 * 表示一个工作区中的会话。
 *
 * Session 概念对应 memories 目录下的每个子目录：
 * - 名称为 "repo" 的子目录是特殊的"工作区级目录"session（isRepo=true，id=DEFAULT_SESSION_IDS.REPO）
 * - 名称为 base64 编码 UUID 的子目录是普通 session，解码后即对应 chatSessions/<sessionId>.jsonl
 */
export interface Session {
  /** Session 唯一标识：
   *  - 普通 session = base64 解码后的 UUID
   *  - 工作区级目录 session = DEFAULT_SESSION_IDS.REPO
   */
  id: string;
  /** 父工作区 ID */
  workspaceId: string;
  /** Session 显示标题（从 jsonl 的 customTitle 或首条用户消息推导） */
  title: string;
  /** 创建时间（ISO 8601） */
  createdAt: string;
  /** Session 下的 memory 条目数量 */
  entryCount: number;
  /**
   * 是否是"工作区级目录"特殊 session（对应 memories/repo 目录）。
   * 默认 false，仅当子目录名为 "repo" 时为 true。
   */
  isRepo?: boolean;
  /**
   * Session 在磁盘上对应的 memories 物理目录的绝对路径（可选）。
   * 用于右键菜单复制路径和在资源管理器中打开。
   */
  absolutePath?: string;
}

/**
 * Represents a single memory entry (a piece of remembered context).
 *
 * 自 v0.0.2 起，readMemoryContent 会递归扫描 session 目录下的所有子目录与文件，
 * 因此 MemoryEntry 既可能表示一个文件，也可能表示一个目录节点（isDirectory=true）。
 * 上层 GUI（entriesToFileTree）会依据 relativePath 将扁平列表重构为多层树。
 */
export interface MemoryEntry {
  /** Unique identifier for the entry */
  id: string;
  /** Parent session ID */
  sessionId: string;
  /** The actual memory content text（目录节点为空字符串） */
  content: string;
  /** Category classification of the memory */
  category: MemoryCategory;
  /** ISO 8601 timestamp */
  timestamp: string;
  /**
   * Original source file absolute path（绝对路径，供 vscode.workspace.openTextDocument 使用）。
   * 目录节点该字段为目录的绝对路径。
   */
  sourceFile: string;
  /**
   * 相对于 session 根目录的路径，使用 POSIX 风格分隔符（"/"）。
   * 顶层文件 / 目录就只是文件名；子目录中的文件形如 "subdir/notes.md"。
   * 用于让 entriesToFileTree 在 GUI 端重建目录层级结构。
   */
  relativePath: string;
  /** 是否为目录节点。true 表示这是一个文件夹（无 content），false / undefined 表示文件 */
  isDirectory?: boolean;
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
 * 钉选项类型：workspace 为工作区，session 为会话
 */
export type PinnedItemType = "workspace" | "session";

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
  /** IDE 重定向目标（在派生 IDE 下检测并引用 VS Code 正式版/体验版的 memories，仅在 agy ide 环境下有效）
   * - "none": 不进行重定向，读取当前 IDE 的目录
   * - "stable": 重定向到 VS Code 稳定版 (Code)
   * - "insiders": 重定向到 VS Code 体验版 (Code - Insiders)
   */
  ideRedirectTarget: "none" | "stable" | "insiders";
}

/**
 * 默认 UI 偏好：预览默认开启
 */
export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  enableFilePreview: true,
  ideRedirectTarget: "stable", // 默认重定向至 VS Code 稳定版
};

/**
 * 工作区级偏好的默认排序：列表默认按创建时间降序，以展示最新的记录
 */
export const DEFAULT_LIST_SORT: SortOption = {
  by: "createdAt",
  direction: "desc",
};

/**
 * 工作区级持久化数据结构
 * 按工作区保存排序与钉选集合
 */
export interface WorkspaceState {
  /** 工作区列表排序 */
  workspaceSort: SortOption;
  /** session 列表排序 */
  sessionSort: SortOption;
  /** 文件树排序 */
  fileTreeSort: SortOption;
  /** 当前是否展开预览面板（仅在 enableFilePreview 为 true 时生效） */
  previewVisible: boolean;
  /** 已钉选的工作区 ID 集合 */
  pinnedWorkspaceIds: string[];
  /** 已钉选的 session ID 集合 */
  pinnedSessionIds: string[];
  /** 仅展示有记忆的工作区（过滤 sessionCount === 0） */
  onlyShowWithMemories: boolean;
  /** 仅展示有条目的会话（过滤 entryCount === 0） */
  onlyShowWithEntries: boolean;
};

/**
 * 默认工作区状态：
 * 默认情况下，工作区列表与会话列表按创建时间倒序排列；文件树保持名称升序排列以方便查看目录树结构。
 */
export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  workspaceSort: { ...DEFAULT_LIST_SORT },
  sessionSort: { ...DEFAULT_LIST_SORT },
  fileTreeSort: { by: "name", direction: "asc" },
  previewVisible: true,
  pinnedWorkspaceIds: [],
  pinnedSessionIds: [],
  onlyShowWithMemories: false,
  onlyShowWithEntries: false,
};

/**
 * 特殊 session ID 常量集合。
 *
 * REPO 用于标识 memories 目录下的 "repo" 子目录映射出的"工作区级目录" session。
 * 该 session 不是基于某个具体 sessionId 创建的，而是特殊的合成分组。
 */
export const DEFAULT_SESSION_IDS = {
  /** memories/repo 子目录对应的工作区级目录 session ID */
  REPO: "_repo_",
} as const;
