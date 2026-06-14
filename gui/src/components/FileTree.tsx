// ============================================================================
// FileTree — 文件资源浏览器树组件（含右键菜单/拖拽/快捷键/重命名/外部导入）
// ============================================================================

import React, { useState, useCallback, useRef } from "react";
import {
  Folder, FolderOpen, FileText, FileImage, File,
  ChevronDown, ChevronRight
} from "lucide-react";
import {
  DndContext, useDraggable, useDroppable,
  DragEndEvent, DragStartEvent, DragOverlay, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { FileTreeNode } from "@/lib/file-tree-types";
import { FileTreeContextMenu, type ContextMenuAction } from "@/components/FileTreeContextMenu";
import { useFileClipboard } from "@/hooks/use-file-clipboard";
import { useFileTreeKeyboard } from "@/hooks/use-file-tree-keyboard";
import {
  useCopyEntries,
  useMoveEntries,
  useRenameEntry,
  useDeleteEntries,
  useImportExternalFile,
  useRevealInOs,
  useCopyPath,
  useReadExternalClipboardFiles,
  useCreateDirectory,
} from "@/hooks/use-bridge";
import { getBridgeEnvironment } from "@/lib/bridge";

/** 外部导入文件大小上限：30MB */
const MAX_IMPORT_SIZE = 30 * 1024 * 1024;

// ---------------------------------------------------------------------------
// 可拖拽的文件树节点组件
// ---------------------------------------------------------------------------

/**
 * 单个文件树节点组件 Props
 */
interface FileTreeNodeComponentProps {
  /** 文件树节点数据 */
  node: FileTreeNode;
  /** 当前节点的层级深度（用于计算缩进） */
  depth: number;
  /** 当前选中文件的节点 */
  selectedNode: FileTreeNode | null;
  /** 选中文件时的回调函数 */
  onSelectFile: (node: FileTreeNode) => void;
  /** 节点完整路径（用于唯一标识与展开状态追踪） */
  currentPath: string;
  /** 当前正在重命名的节点路径 */
  renamingPath: string | null;
  /** 重命名提交回调 */
  onRenameSubmit: (node: FileTreeNode, newName: string) => void;
  /** 取消重命名回调 */
  onRenameCancel: () => void;
  /** 右键菜单操作回调 */
  onContextAction: (action: ContextMenuAction, node: FileTreeNode | null) => void;
  /** 是否有可粘贴的内容 */
  hasPasteContent: boolean;
  /** 当前拖拽中的节点 ID */
  draggingId: string | null;
}

/**
 * 单个树节点的可拖拽/可放置组件
 */
function FileTreeNodeComponent({
  node,
  depth,
  selectedNode,
  onSelectFile,
  currentPath,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  onContextAction,
  hasPasteContent,
  draggingId,
}: FileTreeNodeComponentProps) {
  const [isExpanded, setIsExpanded] = useState(depth === 0); // 默认第一层展开
  const isDirectory = node.type === "dir";
  const isSelected = selectedNode?.name === node.name && selectedNode?.type === node.type
    && selectedNode?.absolutePath === node.absolutePath;
  const isRenaming = renamingPath === currentPath;
  const [renameValue, setRenameValue] = useState(node.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // dnd-kit 拖拽设置
  const nodeId = currentPath;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: nodeId,
    data: { node, path: currentPath },
  });

  // 文件夹作为放置目标
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${nodeId}`,
    data: { node, path: currentPath },
    disabled: !isDirectory,
  });

  // 文件夹点击事件：切换折叠/展开
  const handleDirClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
    onSelectFile(node);
  };

  // 文件点击事件
  const handleFileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === "file") {
      onSelectFile(node);
    }
  };

  // 重命名提交处理
  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name) {
      onRenameSubmit(node, trimmed);
    } else {
      onRenameCancel();
    }
  };

  // 重命名按键处理
  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onRenameCancel();
    }
  };

  // 当进入重命名模式时更新输入值并聚焦
  React.useEffect(() => {
    if (isRenaming) {
      setRenameValue(node.name);
      // 延迟聚焦确保 DOM 已渲染
      setTimeout(() => {
        renameInputRef.current?.focus();
        // 选中文件名（不含扩展名）
        const dotIdx = node.name.lastIndexOf(".");
        if (dotIdx > 0 && node.type === "file") {
          renameInputRef.current?.setSelectionRange(0, dotIdx);
        } else {
          renameInputRef.current?.select();
        }
      }, 0);
    }
  }, [isRenaming, node.name, node.type]);

  // 根据文件类型匹配合适的 Lucide 图标
  const getFileIcon = () => {
    if (node.fileType === "text") {
      return <FileText className="w-3.5 h-3.5 text-brand-indigo" />;
    }
    if (node.fileType === "image") {
      return <FileImage className="w-3.5 h-3.5 text-accent-cyan" />;
    }
    return <File className="w-3.5 h-3.5 text-text-muted" />;
  };

  // 合并拖拽和放置的 ref
  const combinedRef = useCallback(
    (el: HTMLElement | null) => {
      setDragRef(el);
      if (isDirectory) {
        setDropRef(el);
      }
    },
    [setDragRef, setDropRef, isDirectory]
  );

  return (
    <div
      className={cn(
        "select-none font-mono text-[11px] leading-tight",
        isDragging && "opacity-40"
      )}
    >
      <FileTreeContextMenu
        node={node}
        onAction={onContextAction}
        hasPasteContent={hasPasteContent}
      >
        {isDirectory ? (
          // 渲染文件夹节点
          <div>
            <button
              ref={combinedRef}
              {...attributes}
              {...listeners}
              onClick={handleDirClick}
              className={cn(
                "w-full flex items-center gap-1.5 py-1 px-2 rounded text-left transition-colors cursor-pointer text-text-primary",
                "focus:outline-none focus:bg-surface-3/60",
                // 拖拽放置目标高亮
                isOver && !isDragging
                  ? "bg-brand-indigo/15 border border-brand-indigo/40 border-dashed"
                  : "hover:bg-surface-3/40 border border-transparent"
              )}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
            >
              <span className="text-text-muted shrink-0 flex items-center justify-center">
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </span>
              <span className="text-brand-purple shrink-0 flex items-center justify-center">
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5" />
                ) : (
                  <Folder className="w-3.5 h-3.5" />
                )}
              </span>
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={handleRenameKeyDown}
                  className="flex-1 bg-surface-3/60 border border-brand-indigo/40 rounded px-1 py-0.5 text-[11px] font-mono text-text-primary outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate font-semibold">{node.name}</span>
              )}
            </button>

            {/* 展开子目录 */}
            {isExpanded && node.children && (
              <div className="flex flex-col">
                {node.children.map((child, idx) => (
                  <FileTreeNodeComponent
                    key={`${currentPath}/${child.name}-${idx}`}
                    node={child}
                    depth={depth + 1}
                    selectedNode={selectedNode}
                    onSelectFile={onSelectFile}
                    currentPath={`${currentPath}/${child.name}`}
                    renamingPath={renamingPath}
                    onRenameSubmit={onRenameSubmit}
                    onRenameCancel={onRenameCancel}
                    onContextAction={onContextAction}
                    hasPasteContent={hasPasteContent}
                    draggingId={draggingId}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          // 渲染文件节点
          <button
            ref={combinedRef}
            {...attributes}
            {...listeners}
            onClick={handleFileClick}
            className={cn(
              "w-full flex items-center gap-1.5 py-1 px-2 rounded text-left transition-all cursor-pointer",
              isSelected
                ? "bg-selected-bg text-selected-text font-bold border border-selected-border shadow-[inset_0_1px_5px_var(--ui-selected-glow)]"
                : "hover:bg-surface-3/40 border border-transparent text-text-secondary hover:text-text-primary"
            )}
            style={{ paddingLeft: `${depth * 12 + 20}px` }}
          >
            <span className="shrink-0 flex items-center justify-center">
              {getFileIcon()}
            </span>
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleRenameKeyDown}
                className="flex-1 bg-surface-3/60 border border-brand-indigo/40 rounded px-1 py-0.5 text-[11px] font-mono text-text-primary outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </button>
        )}
      </FileTreeContextMenu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FileTree 主组件
// ---------------------------------------------------------------------------

/**
 * 完整的文件树视图容器组件 Props
 */
interface FileTreeProps {
  /** 根目录节点列表 */
  data: FileTreeNode[];
  /** 当前选中的节点 */
  selectedNode: FileTreeNode | null;
  /** 选中文件时的回调 */
  onSelectFile: (node: FileTreeNode) => void;
  /** 文件树根目录的绝对路径（用于确定粘贴和拖放的根目标） */
  rootPath?: string;
}

/**
 * 递归查找节点的绝对路径：从文件树中匹配 currentPath 对应的节点，返回其 absolutePath。
 * 若节点是文件夹且有 children，取第一个子节点的 absolutePath 的父目录。
 */
function resolveNodeAbsolutePath(node: FileTreeNode): string | undefined {
  if (node.absolutePath) return node.absolutePath;
  // 文件夹节点可能没有 absolutePath，从子节点推断
  if (node.children) {
    for (const child of node.children) {
      const childPath = resolveNodeAbsolutePath(child);
      if (childPath) {
        // 返回子节点路径的父目录 + 当前节点名
        const parts = childPath.replace(/\\/g, "/").split("/");
        parts.pop(); // 移除子节点名
        return parts.join("/");
      }
    }
  }
  return undefined;
}

/**
 * 获取节点的父目录绝对路径
 */
function getNodeParentDir(node: FileTreeNode): string | undefined {
  const absPath = resolveNodeAbsolutePath(node);
  if (!absPath) return undefined;
  if (node.type === "dir") return absPath;
  // 文件节点：取父目录
  const parts = absPath.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}

/**
 * 文件资源浏览器树组件，用于展示多级目录结构。
 * 集成了右键菜单、@dnd-kit 拖拽、快捷键、重命名内联编辑和外部文件拖入导入。
 */
export function FileTree({ data, selectedNode, onSelectFile, rootPath }: FileTreeProps) {
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 文件操作 hooks
  const copyEntries = useCopyEntries();
  const moveEntries = useMoveEntries();
  const renameEntry = useRenameEntry();
  const deleteEntries = useDeleteEntries();
  const importExternalFile = useImportExternalFile();
  const revealInOs = useRevealInOs();
  const copyPath = useCopyPath();
  const readExternalClipboard = useReadExternalClipboardFiles();
  const createDirectory = useCreateDirectory();
  const { clipboard, setClipboard, clearClipboard } = useFileClipboard();

  // dnd-kit 传感器：使用距离激活，避免点击误触发拖拽
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  /**
   * 推断文件树根目录的绝对路径
   */
  const inferRootPath = useCallback((): string | undefined => {
    if (rootPath) return rootPath;
    // 从第一个节点推断根路径
    if (data.length > 0) {
      const firstNode = data[0];
      if (!firstNode) return undefined;
      const firstNodePath = resolveNodeAbsolutePath(firstNode);
      if (firstNodePath) {
        const parts = firstNodePath.replace(/\\/g, "/").split("/");
        parts.pop();
        return parts.join("/");
      }
    }
    return undefined;
  }, [data, rootPath]);

  // ---------------------------------------------------------------------------
  // 右键菜单操作处理
  // ---------------------------------------------------------------------------

  /**
   * 右键菜单操作统一处理器
   */
  const handleContextAction = useCallback(
    async (action: ContextMenuAction, node: FileTreeNode | null) => {
      try {
        switch (action) {
          case "copy": {
            if (!node?.absolutePath && node?.type === "dir") {
              const dirPath = resolveNodeAbsolutePath(node);
              if (dirPath) setClipboard("copy", [dirPath]);
            } else if (node?.absolutePath) {
              setClipboard("copy", [node.absolutePath]);
            }
            break;
          }
          case "cut": {
            if (!node?.absolutePath && node?.type === "dir") {
              const dirPath = resolveNodeAbsolutePath(node);
              if (dirPath) setClipboard("cut", [dirPath]);
            } else if (node?.absolutePath) {
              setClipboard("cut", [node.absolutePath]);
            }
            break;
          }
          case "paste": {
            // 确定粘贴目标目录
            const targetDir = node
              ? resolveNodeAbsolutePath(node) ?? inferRootPath()
              : inferRootPath();
            if (!targetDir) return;

            if (clipboard) {
              // 内部剪贴板有内容：执行复制或移动
              if (clipboard.mode === "copy") {
                await copyEntries(clipboard.paths, targetDir);
              } else {
                await moveEntries(clipboard.paths, targetDir);
                clearClipboard();
              }
            } else {
              // 内部剪贴板为空：尝试读取外部剪贴板
              const result = await readExternalClipboard();
              if (result.unsupported) {
                console.warn("[FileTree] 当前平台不支持外部文件粘贴，请改用拖拽");
                return;
              }
              if (result.paths.length > 0) {
                await copyEntries(result.paths, targetDir);
              }
            }
            break;
          }
          case "copyPath": {
            if (node) {
              const absPath = node.absolutePath ?? resolveNodeAbsolutePath(node);
              if (absPath) await copyPath(absPath, false);
            }
            break;
          }
          case "copyRelativePath": {
            if (node) {
              const absPath = node.absolutePath ?? resolveNodeAbsolutePath(node);
              if (absPath) await copyPath(absPath, true);
            }
            break;
          }
          case "rename": {
            if (node) {
              // 激活重命名模式，FileTreeNodeComponent 会根据 renamingPath 显示输入框
              // 需要找到这个节点的 currentPath
              setRenamingPath(findNodePath(data, node));
            }
            break;
          }
          case "delete": {
            if (node) {
              const absPath = node.absolutePath ?? resolveNodeAbsolutePath(node);
              if (absPath) {
                await deleteEntries([absPath], true);
              }
            }
            break;
          }
          case "revealInOs": {
            if (node) {
              const absPath = node.absolutePath ?? resolveNodeAbsolutePath(node);
              if (absPath) await revealInOs(absPath);
            }
            break;
          }
          case "newFolder": {
            const parentDir = node
              ? resolveNodeAbsolutePath(node) ?? inferRootPath()
              : inferRootPath();
            if (parentDir) {
              // 创建新文件夹，使用默认名称
              const newDirPath = `${parentDir}/新建文件夹`;
              await createDirectory(newDirPath);
            }
            break;
          }
        }
      } catch (err) {
        console.error(`[FileTree] 操作 ${action} 失败:`, err);
      }
    },
    [clipboard, setClipboard, clearClipboard, copyEntries, moveEntries, deleteEntries,
     revealInOs, copyPath, readExternalClipboard, createDirectory, inferRootPath, data]
  );

  // ---------------------------------------------------------------------------
  // 重命名处理
  // ---------------------------------------------------------------------------

  /** 重命名提交处理 */
  const handleRenameSubmit = useCallback(
    async (node: FileTreeNode, newName: string) => {
      const absPath = node.absolutePath ?? resolveNodeAbsolutePath(node);
      if (absPath) {
        try {
          await renameEntry(absPath, newName);
        } catch (err) {
          console.error("[FileTree] 重命名失败:", err);
        }
      }
      setRenamingPath(null);
    },
    [renameEntry]
  );

  /** 取消重命名 */
  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  // ---------------------------------------------------------------------------
  // dnd-kit 拖拽处理
  // ---------------------------------------------------------------------------

  /** 内部拖拽开始 */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(event.active.id as string);
  }, []);

  /** 内部拖拽结束：移动文件到目标文件夹 */
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDraggingId(null);
      const { active, over } = event;
      if (!over || !active) return;

      const sourceData = active.data.current as { node: FileTreeNode; path: string } | undefined;
      const targetData = over.data.current as { node: FileTreeNode; path: string } | undefined;

      if (!sourceData || !targetData) return;
      // 只能拖放到文件夹
      if (targetData.node.type !== "dir") return;
      // 不能拖放到自身
      if (sourceData.path === targetData.path) return;

      const sourcePath = sourceData.node.absolutePath ?? resolveNodeAbsolutePath(sourceData.node);
      const targetDir = resolveNodeAbsolutePath(targetData.node);

      if (sourcePath && targetDir) {
        try {
          await moveEntries([sourcePath], targetDir);
        } catch (err) {
          console.error("[FileTree] 拖拽移动失败:", err);
        }
      }
    },
    [moveEntries]
  );

  // ---------------------------------------------------------------------------
  // 外部文件拖入处理（HTML5 DataTransfer）
  // ---------------------------------------------------------------------------

  /** 外部文件拖入 dragover 处理 */
  const handleExternalDragOver = useCallback((e: React.DragEvent) => {
    // 检查是否是外部文件拖入（而非内部 dnd-kit 拖拽）
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      setIsExternalDragOver(true);
    }
  }, []);

  /** 外部文件拖入 dragleave 处理 */
  const handleExternalDragLeave = useCallback((e: React.DragEvent) => {
    // 仅在离开容器边界时取消高亮（避免子元素触发误取消）
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setIsExternalDragOver(false);
    }
  }, []);

  /**
   * 外部文件 drop 处理：读取 DataTransfer 中的文件，转 base64 后调协议写入磁盘。
   * 单文件大小超过 30MB 的会被跳过并提示。
   */
  const handleExternalDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsExternalDragOver(false);

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const targetDir = inferRootPath();
      if (!targetDir) {
        console.warn("[FileTree] 无法确定导入目标目录");
        return;
      }

      // 逐个处理拖入的文件
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        // 单文件大小校验
        if (file.size > MAX_IMPORT_SIZE) {
          console.warn(
            `[FileTree] 文件过大（上限 30MB），已跳过：${file.name}（${(file.size / 1024 / 1024).toFixed(1)}MB）`
          );
          continue;
        }

        try {
          // 读取文件内容并转为 base64
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let j = 0; j < uint8Array.length; j++) {
            binary += String.fromCharCode(uint8Array[j] ?? 0);
          }
          const contentBase64 = btoa(binary);

          await importExternalFile(targetDir, file.name, contentBase64, file.size);
        } catch (err) {
          console.error(`[FileTree] 导入文件失败：${file.name}`, err);
        }
      }
    },
    [inferRootPath, importExternalFile]
  );

  // ---------------------------------------------------------------------------
  // 快捷键绑定
  // ---------------------------------------------------------------------------

  const { handleKeyDown } = useFileTreeKeyboard({
    selectedNode,
    onCopy: (node) => handleContextAction("copy", node),
    onCut: (node) => handleContextAction("cut", node),
    onPaste: (targetNode) => handleContextAction("paste", targetNode),
    onDelete: (node) => handleContextAction("delete", node),
    onRename: (node) => handleContextAction("rename", node),
  });

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------

  const hasPasteContent = !!clipboard;

  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-center text-text-muted font-mono text-[11px]">
        目录为空
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* 外部文件拖入覆盖层 + 快捷键容器 */}
      <FileTreeContextMenu
        node={null}
        onAction={handleContextAction}
        hasPasteContent={hasPasteContent}
      >
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onDragOver={handleExternalDragOver}
          onDragLeave={handleExternalDragLeave}
          onDrop={handleExternalDrop}
          className={cn(
            "flex flex-col gap-0.5 p-2 overflow-y-auto h-full min-h-0 outline-none",
            isExternalDragOver && "bg-brand-indigo/5 border-2 border-dashed border-brand-indigo/30 rounded-lg"
          )}
        >
          {data.map((node, index) => (
            <FileTreeNodeComponent
              key={`${node.name}-${index}`}
              node={node}
              depth={0}
              selectedNode={selectedNode}
              onSelectFile={onSelectFile}
              currentPath={node.name}
              renamingPath={renamingPath}
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={handleRenameCancel}
              onContextAction={handleContextAction}
              hasPasteContent={hasPasteContent}
              draggingId={draggingId}
            />
          ))}
        </div>
      </FileTreeContextMenu>

      {/* 拖拽覆盖层（显示拖拽中的节点名称） */}
      <DragOverlay>
        {draggingId ? (
          <div className="bg-surface-2/90 border border-brand-indigo/40 rounded px-3 py-1 text-[11px] font-mono text-text-primary shadow-lg backdrop-blur-sm">
            📦 移动中...
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 在文件树中查找指定节点的 currentPath（用于重命名定位）
 */
function findNodePath(
  data: FileTreeNode[],
  target: FileTreeNode,
  prefix = ""
): string | null {
  for (const node of data) {
    const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (
      node.name === target.name &&
      node.type === target.type &&
      node.absolutePath === target.absolutePath
    ) {
      return currentPath;
    }
    if (node.children) {
      const found = findNodePath(node.children, target, currentPath);
      if (found) return found;
    }
  }
  return null;
}
