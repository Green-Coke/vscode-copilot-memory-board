import React, { useState } from "react";
import { 
  Folder, FolderOpen, FileText, FileImage, File, 
  ChevronDown, ChevronRight 
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileTreeNode } from "@/lib/file-tree-types";

/**
 * 单个文件树节点组件 Props
 */
interface FileTreeNodeProps {
  /** 文件树节点数据 */
  node: FileTreeNode;
  /** 当前节点的层级深度（用于计算缩进） */
  depth: number;
  /** 当前选中文件的节点 */
  selectedNode: FileTreeNode | null;
  /** 选中文件时的回调函数；同时也会在点击目录时被调用以通知上层清空预览 */
  onSelectFile: (node: FileTreeNode) => void;
  /** 节点完整路径（用于唯一标识与展开状态追踪） */
  currentPath: string;
}

/**
 * 单个树节点（文件夹或文件）的递归渲染组件
 */
function FileTreeNode({ 
  node, 
  depth, 
  selectedNode, 
  onSelectFile,
  currentPath 
}: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth === 0); // 默认第一层展开
  const isDirectory = node.type === "dir";
  const isSelected = selectedNode?.name === node.name && selectedNode?.type === node.type;

  // 文件夹点击事件：切换折叠/展开，并通知上层当前选中目录，便于关闭右侧预览
  const handleDirClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
    onSelectFile(node);
  };

  // 文件点击事件：触发选择回调
  const handleFileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === "file") {
      onSelectFile(node);
    }
  };

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

  return (
    <div className="select-none font-mono text-[11px] leading-tight">
      {isDirectory ? (
        // 渲染文件夹节点
        <div>
          <button
            onClick={handleDirClick}
            className={cn(
              "w-full flex items-center gap-1.5 py-1 px-2 rounded hover:bg-surface-3/40 text-left transition-colors cursor-pointer text-text-primary",
              "focus:outline-none focus:bg-surface-3/60"
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
            <span className="truncate font-semibold">{node.name}</span>
          </button>

          {/* 展开子目录 */}
          {isExpanded && node.children && (
            <div className="flex flex-col">
              {node.children.map((child, idx) => (
                <FileTreeNode
                  key={`${currentPath}/${child.name}-${idx}`}
                  node={child}
                  depth={depth + 1}
                  selectedNode={selectedNode}
                  onSelectFile={onSelectFile}
                  currentPath={`${currentPath}/${child.name}`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        // 渲染文件节点
        <button
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
          <span className="truncate">{node.name}</span>
        </button>
      )}
    </div>
  );
}

/**
 * 完整的文件树视图容器组件
 */
interface FileTreeProps {
  /** 根目录节点列表 */
  data: FileTreeNode[];
  /** 当前选中的节点 */
  selectedNode: FileTreeNode | null;
  /** 选中文件时的回调 */
  onSelectFile: (node: FileTreeNode) => void;
}

/**
 * 文件资源浏览器树组件，用于展示多级目录结构
 */
export function FileTree({ data, selectedNode, onSelectFile }: FileTreeProps) {
  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-center text-text-muted font-mono text-[11px]">
        目录为空
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto h-full min-h-0">
      {data.map((node, index) => (
        <FileTreeNode
          key={`${node.name}-${index}`}
          node={node}
          depth={0}
          selectedNode={selectedNode}
          onSelectFile={onSelectFile}
          currentPath={node.name}
        />
      ))}
    </div>
  );
}
