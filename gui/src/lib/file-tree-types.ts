// ============================================================================
// 文件树节点类型定义（共享类型）
// ============================================================================
// 该类型是 MemoryViewer / FileTree / FilePreview / sort-utils 共享的纯类型，
// 不含任何 mock 数据或副作用。原 MockFsNode 类型从 mock-filetree.ts 抽离到此处，
// 让组件可以在不依赖 mock 模块的前提下复用文件树形状。
// ============================================================================

/**
 * 文件树节点，描述 Memory 文件树中的一层（文件 / 目录）。
 *
 * 真实数据来源（已废弃 mock）：
 * - MemoryEntry.sourceFile 字段已是绝对路径
 * - timestamp 字段（.md 文件的 mtime）映射为 updatedAt / createdAt
 *
 * 与原 MockFsNode 的差异：
 * - 新增 absolutePath 字段：完整磁盘路径，用于 bridge openFile 时传 path
 */
export interface FileTreeNode {
  /** 节点名称（文件名或文件夹名） */
  name: string;
  /** 节点类型：dir 表示文件夹，file 表示文件 */
  type: "dir" | "file";
  /** 子节点列表（仅文件夹有此属性） */
  children?: FileTreeNode[];
  /** 文件类型：text 表示文本/代码，image 表示图片，unknown 表示未知格式 */
  fileType?: "text" | "image" | "unknown";
  /** 文件文本内容（仅文本文件有此属性） */
  content?: string;
  /** 磁盘绝对路径（仅文件有此属性），用于 bridge openFile 时传 path */
  absolutePath?: string;
  /** 文件图片链接或 Base64 资源（仅图片文件有此属性） */
  src?: string;
  /** 节点创建时间（ISO 8601），用于按创建时间排序 */
  createdAt?: string;
  /** 节点更新时间（ISO 8601），用于按更新时间排序 */
  updatedAt?: string;
}
