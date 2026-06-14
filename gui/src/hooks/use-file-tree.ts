// ============================================================================
// useFileTree — 从 MemoryEntry[] 构造 FileTreeNode 树（无 mock）
// ============================================================================
// 真实 Memory 文件在文件系统上是「平铺」的：每个 session 目录下有一组 .md 文件，
// 没有子目录概念。这里把 MemoryEntry 平铺为一个根节点下的文件节点数组。
//
// 数据来源：
//   - wiki MemoryEntry.id: `${sessionId}::${filename}`
//   - sourceFile: 绝对路径（Phase 1 修复），传给 bridge openFile 的 path 字段
//   - content:    .md 文件正文，预览面板直接渲染
//   - timestamp:  .md 文件的 mtime，映射为 createdAt / updatedAt
// ============================================================================

import { useMemo } from "react";
import type { MemoryEntry } from "@memory-board/core";
import type { FileTreeNode } from "@/lib/file-tree-types";

/**
 * 把 MemoryEntry[] 转换为 FileTreeNode 树。
 *
 * 当前实现：所有 entry 平铺为顶层文件节点（不分组、不构造虚拟目录）。
 * 未来若想按主题、按时间归档分组，可在此扩展。
 *
 * @param entries bridge readMemoryContent 拉到的条目
 */
export function entriesToFileTree(entries: MemoryEntry[]): FileTreeNode[] {
  return entries.map((entry) => {
    const fileName = entry.sourceFile.split(/[\\/]/).pop() ?? entry.id;
    return {
      name: fileName,
      type: "file" as const,
      fileType: "text" as const,
      content: entry.content,
      absolutePath: entry.sourceFile,
      createdAt: entry.timestamp,
      updatedAt: entry.timestamp,
    };
  });
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
