// ============================================================================
// use-file-tree-keyboard — 文件树快捷键绑定
// ============================================================================
// 在 FileTree 容器获得焦点时拦截键盘快捷键：
//   - Ctrl+C (Mac: Cmd+C) → 复制选中节点
//   - Ctrl+X → 剪切
//   - Ctrl+V → 粘贴到当前展开文件夹或根目录
//   - Delete (Mac: Cmd+Backspace) → 删除确认
//   - F2 → 进入重命名编辑模式
// 注意：在 input/textarea 内不拦截（避免与重命名输入框冲突）
// ============================================================================

import { useCallback } from "react";
import type { FileTreeNode } from "@/lib/file-tree-types";
import { useFileClipboard } from "@/hooks/use-file-clipboard";

/**
 * 文件树快捷键配置参数
 */
interface UseFileTreeKeyboardOptions {
  /** 当前选中的节点 */
  selectedNode: FileTreeNode | null;
  /** 复制操作回调 */
  onCopy: (node: FileTreeNode) => void;
  /** 剪切操作回调 */
  onCut: (node: FileTreeNode) => void;
  /** 粘贴操作回调（targetNode 可能是文件夹节点或 null） */
  onPaste: (targetNode: FileTreeNode | null) => void;
  /** 删除操作回调 */
  onDelete: (node: FileTreeNode) => void;
  /** 进入重命名模式回调 */
  onRename: (node: FileTreeNode) => void;
}

/**
 * 文件树快捷键 hook。
 * 返回一个 onKeyDown 事件处理器，绑定到 FileTree 的容器 div 上。
 * 仅在容器获得焦点时拦截，且 input/textarea 内不拦截。
 */
export function useFileTreeKeyboard({
  selectedNode,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onRename,
}: UseFileTreeKeyboardOptions) {
  const { clipboard } = useFileClipboard();

  /**
   * 键盘事件处理器。
   * 检查当前焦点是否在 input/textarea 内，避免与重命名编辑冲突。
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 在 input/textarea 中不拦截快捷键
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea") {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Ctrl+C: 复制
      if (isCtrlOrCmd && e.key === "c") {
        if (selectedNode) {
          e.preventDefault();
          e.stopPropagation();
          onCopy(selectedNode);
        }
        return;
      }

      // Ctrl+X: 剪切
      if (isCtrlOrCmd && e.key === "x") {
        if (selectedNode) {
          e.preventDefault();
          e.stopPropagation();
          onCut(selectedNode);
        }
        return;
      }

      // Ctrl+V: 粘贴
      if (isCtrlOrCmd && e.key === "v") {
        e.preventDefault();
        e.stopPropagation();
        // 粘贴目标：选中的文件夹节点，或 null（根目录）
        const targetNode = selectedNode?.type === "dir" ? selectedNode : null;
        onPaste(targetNode);
        return;
      }

      // Delete / Cmd+Backspace: 删除
      if (e.key === "Delete" || (e.metaKey && e.key === "Backspace")) {
        if (selectedNode) {
          e.preventDefault();
          e.stopPropagation();
          onDelete(selectedNode);
        }
        return;
      }

      // F2: 重命名
      if (e.key === "F2") {
        if (selectedNode) {
          e.preventDefault();
          e.stopPropagation();
          onRename(selectedNode);
        }
        return;
      }
    },
    [selectedNode, clipboard, onCopy, onCut, onPaste, onDelete, onRename]
  );

  return { handleKeyDown };
}
