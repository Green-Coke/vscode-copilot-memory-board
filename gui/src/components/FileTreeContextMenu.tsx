// ============================================================================
// FileTreeContextMenu — 文件树右键上下文菜单
// ============================================================================
// 基于 @radix-ui/react-context-menu 实现文件树节点的右键菜单。
// 三类菜单场景：
//   1. 文件节点：复制 / 剪切 / 复制路径 / 复制相对路径 / 重命名 / 删除 / 在资源管理器中显示
//   2. 文件夹节点：上述全部 + 粘贴 + 新建文件夹
//   3. 空白区域（树容器背景）：粘贴 + 新建文件夹
// Standalone 模式下写操作菜单项自动禁用。
// ============================================================================

import React from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Copy, Scissors, ClipboardPaste, Pencil, Trash2,
  FolderOpen, FolderPlus, FileText, Link
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileTreeNode } from "@/lib/file-tree-types";
import { getBridgeEnvironment } from "@/lib/bridge";

/**
 * 菜单操作类型枚举
 */
export type ContextMenuAction =
  | "copy"
  | "cut"
  | "paste"
  | "copyPath"
  | "rename"
  | "delete"
  | "revealInOs"
  | "newFolder";

/**
 * FileTreeContextMenu Props
 */
interface FileTreeContextMenuProps {
  /** 触发菜单的子元素 */
  children: React.ReactNode;
  /** 当前右键的节点（null 表示空白区域） */
  node: FileTreeNode | null;
  /** 菜单操作回调 */
  onAction: (action: ContextMenuAction, node: FileTreeNode | null) => void;
  /** 是否有可粘贴的内容（内部剪贴板非空或外部文件可粘贴） */
  hasPasteContent: boolean;
}

/**
 * 右键上下文菜单项组件：统一的菜单项样式
 */
/**
 * 右键上下文菜单项组件：统一的菜单项样式，微调 padding 与 gap 以防图标与快捷键紧贴边框
 */
function MenuItem({
  icon: Icon,
  label,
  shortcut,
  disabled,
  destructive,
  onSelect,
}: {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex items-center gap-3 pl-4 pr-3.5 py-1.5 text-[11px] font-mono rounded-sm cursor-pointer",
        "outline-none select-none transition-colors",
        disabled
          ? "text-text-muted/40 cursor-not-allowed"
          : destructive
            ? "text-red-400 hover:bg-red-500/15 focus:bg-red-500/15"
            : "text-text-secondary hover:bg-surface-3/60 focus:bg-surface-3/60 hover:text-text-primary"
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-text-muted/60 ml-4">{shortcut}</span>
      )}
    </ContextMenu.Item>
  );
}

/**
 * 文件树右键上下文菜单组件。
 * 根据节点类型（文件/文件夹/空白区域）动态渲染不同菜单项。
 */
export function FileTreeContextMenu({
  children,
  node,
  onAction,
  hasPasteContent,
}: FileTreeContextMenuProps) {
  const isStandalone = getBridgeEnvironment() === "standalone";
  const isDir = node?.type === "dir";
  const isFile = node?.type === "file";
  // 空白区域菜单（node === null）只有粘贴和新建文件夹
  const isBlank = node === null;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          /* 设置 collisionPadding 防止在靠左或靠边点击时菜单被视口边缘（如左侧边栏）遮挡 */
          collisionPadding={10}
          className={cn(
            "min-w-[180px] py-1.5 px-1.5",
            "rounded-lg border border-border-default/60",
            "bg-surface-1/95 backdrop-blur-md",
            "shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
            "z-[9999]",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
        >
          {/* 文件或文件夹节点：复制 / 剪切 */}
          {!isBlank && (
            <>
              <MenuItem
                icon={Copy}
                label="复制"
                shortcut="Ctrl+C"
                disabled={isStandalone}
                onSelect={() => onAction("copy", node)}
              />
              <MenuItem
                icon={Scissors}
                label="剪切"
                shortcut="Ctrl+X"
                disabled={isStandalone}
                onSelect={() => onAction("cut", node)}
              />
            </>
          )}

          {/* 文件夹或空白区域：粘贴 + 新建文件夹 */}
          {(isDir || isBlank) && (
            <>
              {!isBlank && <ContextMenu.Separator className="h-px bg-border-subtle/40 my-1 mx-2" />}
              <MenuItem
                icon={ClipboardPaste}
                label="粘贴"
                shortcut="Ctrl+V"
                disabled={isStandalone || !hasPasteContent}
                onSelect={() => onAction("paste", node)}
              />
              <MenuItem
                icon={FolderPlus}
                label="新建文件夹"
                disabled={isStandalone}
                onSelect={() => onAction("newFolder", node)}
              />
            </>
          )}

          {/* 文件或文件夹节点：路径操作 */}
          {!isBlank && (
            <>
              <ContextMenu.Separator className="h-px bg-border-subtle/40 my-1 mx-2" />
              <MenuItem
                icon={Link}
                label="复制路径"
                onSelect={() => onAction("copyPath", node)}
              />
            </>
          )}

          {/* 文件或文件夹节点：重命名 / 删除 / 在资源管理器中显示 */}
          {!isBlank && (
            <>
              <ContextMenu.Separator className="h-px bg-border-subtle/40 my-1 mx-2" />
              <MenuItem
                icon={Pencil}
                label="重命名"
                shortcut="F2"
                disabled={isStandalone}
                onSelect={() => onAction("rename", node)}
              />
              <MenuItem
                icon={Trash2}
                label="删除"
                shortcut="Del"
                disabled={isStandalone}
                destructive
                onSelect={() => onAction("delete", node)}
              />
              <MenuItem
                icon={FolderOpen}
                label="在资源管理器中显示"
                onSelect={() => onAction("revealInOs", node)}
              />
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
