// ============================================================================
// useFileTree — 从 MemoryEntry[] 构造 FileTreeNode 树（无 mock）
// ============================================================================
// 自 v0.0.2 起，readMemoryContent 会递归扫描 session 目录，因此 entries 既包含
// 文件也包含目录节点（isDirectory=true）。relativePath（POSIX 风格）表达完整路径。
//
// 本 hook 负责把扁平的 MemoryEntry[] 重建为多层 FileTreeNode 树：
//   - isDirectory=true 的 entry  → 对应 type="dir" 的节点，并继续填充其 children
//   - 其余 entry                 → type="file" 的叶子节点
//
// 数据来源：
//   - MemoryEntry.id:          `${sessionId}::${relativePath}`
//   - sourceFile:              绝对路径（Phase 1 修复），传给 bridge openFile 的 path 字段
//   - content:                 文件正文（utf8 读取）；目录节点为 ""
//   - timestamp:               文件 / 目录的 mtime，映射为 createdAt / updatedAt
//   - relativePath:            相对 session 根目录的路径，用于构造层级结构
// ============================================================================

import { useMemo } from "react";
import type { MemoryEntry } from "@memory-board/core";
import type { FileTreeNode } from "@/lib/file-tree-types";

/**
 * 已知的图片扩展名集合（小写、不含点）。
 * 用于推断 FileTreeNode.fileType，影响 FilePreview / FileTree 的渲染分支。
 */
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
]);

/**
 * 根据文件名扩展名推断文件类型。
 *
 * - image：图片类（png/jpg/svg 等），FilePreview 会用 FileImage 分支渲染
 * - text：其余文件统一按文本/代码处理（.md / .json / .txt / .ts …）
 * - unknown：无扩展名时回退为 unknown
 */
function inferFileType(fileName: string): "text" | "image" | "unknown" {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return "unknown";
  }
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  return "text";
}

/**
 * 从 entry 兑出一个安全的 relativePath。
 *
 * 优先使用 entry.relativePath（v0.0.2+ 数据）；
 * 旧版 / 残缺响应可能没有这个字段，则退化使用 sourceFile basename 或 entry.id。
 * 返回值一定是字符串，防止后续 split("/") 拋 undefined 错误。
 */
function safeRelativePath(entry: MemoryEntry): string {
  if (typeof entry.relativePath === "string" && entry.relativePath.length > 0) {
    return entry.relativePath;
  }
  // 旧版数据无 relativePath，从 sourceFile basename 退化
  if (typeof entry.sourceFile === "string" && entry.sourceFile.length > 0) {
    const base = entry.sourceFile.split(/[\\/]/).pop();
    if (base) return base;
  }
  // 极端情况：只剩下 id（格式应为 `${sessionId}::${filename}`）
  if (typeof entry.id === "string" && entry.id.length > 0) {
    const idx = entry.id.lastIndexOf("::");
    if (idx >= 0) return entry.id.slice(idx + 2);
    return entry.id;
  }
  return "unknown";
}

/**
 * 把单个 MemoryEntry 转换为 FileTreeNode（不含 children，children 由 buildTree 填充）。
 *
 * 目录节点：type="dir"，无 content。
 * 文件节点：type="file"，附带 fileType、content、absolutePath。
 *
 * 容错：relativePath 缺失时会从 sourceFile basename / id 反推，避免让整个 MemoryViewer 崩溃。
 */
function entryToNode(entry: MemoryEntry): FileTreeNode {
  // relativePath 可能是旧版数据缺失；safeRelativePath 保证返回字符串
  const relativePath = safeRelativePath(entry);
  // relativePath 已被归一为 POSIX 风格，最后一段就是显示名称
  const segments = relativePath.split("/");
  const name = segments[segments.length - 1] || entry.id || relativePath;

  // isDirectory 可能是旧版数据缺失；默认按 file 处理（旧版响应里只有文件 entry）
  const isDirectory = entry.isDirectory === true;

  if (isDirectory) {
    return {
      name,
      type: "dir",
      absolutePath: entry.sourceFile,
      createdAt: entry.timestamp,
      updatedAt: entry.timestamp,
    };
  }

  return {
    name,
    type: "file",
    fileType: inferFileType(name),
    content: entry.content,
    absolutePath: entry.sourceFile,
    createdAt: entry.timestamp,
    updatedAt: entry.timestamp,
  };
}

/**
 * 树构建过程中的中间节点（带可变 children 引用，便于挂载子节点）。
 */
interface MutableTreeNode extends FileTreeNode {
  children?: MutableTreeNode[];
}

/**
 * 把扁平 MemoryEntry[] 重建为多层 FileTreeNode 树。
 *
 * 实现思路：
 * 1. 第一遍扫描所有 entry，按 relativePath 的祖先链补齐缺失的中间目录节点
 *    （实际数据里目录节点应该是齐全的，但补齐逻辑让函数对残缺数据更鲁棒）；
 * 2. 用 relativePath → 节点 的 Map 维护索引，O(n) 完成挂接。
 *
 * 同名目录排序：目录在前、文件在后；同类按 name 字母序。
 *
 * @param entries bridge readMemoryContent 拉到的条目（含目录与文件）
 */
export function entriesToFileTree(entries: MemoryEntry[]): FileTreeNode[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  let root: MutableTreeNode;
  try {
    root = { name: "", type: "dir", children: [] };
  // 用 relativePath → MutableTreeNode 索引，避免在 children 数组里线性查找
  const nodeMap = new Map<string, MutableTreeNode>();
  nodeMap.set("", root);

  const ensureDir = (relativePath: string): MutableTreeNode => {
    const cached = nodeMap.get(relativePath);
    if (cached) {
      return cached;
    }
    const segments = relativePath.split("/");
    const name = segments[segments.length - 1] || relativePath;
    const parentPath = segments.slice(0, -1).join("/");
    const parent = ensureDir(parentPath);
    const dirNode: MutableTreeNode = {
      name,
      type: "dir",
      children: [],
    };
    parent.children ??= [];
    parent.children.push(dirNode);
    nodeMap.set(relativePath, dirNode);
    return dirNode;
  };

  for (const entry of entries) {
    // 容错：relativePath / isDirectory 可能是旧版数据缺失，safeRelativePath / entryToNode 已处理
    const relativePath = safeRelativePath(entry);
    const node: MutableTreeNode = entryToNode(entry);
    nodeMap.set(relativePath, node);

    // 把节点挂到 parent 的 children 上。若是目录节点，ensureDir 已经预先放好
    // 了占位节点，这里用同 key 覆盖之前 map 中的占位（注意 children 引用保留）。
    const segments = relativePath.split("/");
    const parentPath = segments.slice(0, -1).join("/");
    const parent = ensureDir(parentPath);

    const isDirectory = entry.isDirectory === true;
    if (isDirectory) {
      // 如果之前 ensureDir 已经为这个路径创建过占位目录，复用其 children 引用
      const existing = nodeMap.get(relativePath);
      if (existing && existing !== node && existing.type === "dir") {
        // 把 entry 的元数据（createdAt/updatedAt/absolutePath）合并到已存在的占位节点
        Object.assign(existing, {
          createdAt: entry.timestamp,
          updatedAt: entry.timestamp,
          absolutePath: entry.sourceFile,
        });
        // 已在 parent.children 中，无需再 push
      } else {
        parent.children ??= [];
        parent.children.push(node);
      }
    } else {
      parent.children ??= [];
      parent.children.push(node);
    }
  }

  // 对每一层子节点排序：目录优先，再按名称
  const sortRecursive = (node: MutableTreeNode): void => {
    if (!node.children || node.children.length === 0) return;
    node.children.sort((a, b) => {
      const aDir = a.type === "dir" ? 0 : 1;
      const bDir = b.type === "dir" ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortRecursive);
  };
  sortRecursive(root);

  return (root.children ?? []) as FileTreeNode[];
  } catch (err) {
    // 极端情况（相对路径节点缺失、循环引用等）也不能让整个 MemoryViewer 崩溃
    console.error("[useFileTree] entriesToFileTree 构造树失败，降级返回空数组", err, entries);
    return [];
  }
}

/**
 * Hook：根据 entries 自动构造 FileTreeNode 树，记忆化避免重渲。
 */
export function useFileTree(entries: MemoryEntry[] | null | undefined): FileTreeNode[] {
  return useMemo(() => {
    if (!entries || entries.length === 0) return [];
    return entriesToFileTree(entries);
  }, [entries]);
}
