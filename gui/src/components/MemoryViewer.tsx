// ============================================================================
// MemoryViewer — VS Code 风格的文件浏览器与预览面板
// ============================================================================

import { useState, useEffect, useMemo } from "react";
import type { MemoryEntry } from "@memory-board/core";
import { cn } from "@/lib/utils";
import { Search, X, MessageSquare, Terminal } from "lucide-react";
import { FileTree } from "@/components/FileTree";
import { FilePreview } from "@/components/FilePreview";
import { getMockFileTree, getMockRepoFileTree, type MockFsNode } from "@/lib/mock-filetree";

/**
 * MemoryViewer 组件 Props 接口定义
 */
interface MemoryViewerProps {
  /** 备用的内存条目数据（用于兼容旧版接口） */
  entries: MemoryEntry[];
  /** 是否正在加载中 */
  loading?: boolean;
  /** 当前选中的会话标题 */
  sessionTitle?: string;
  /** 当前选中的会话 ID，用于加载 mock 文件树 */
  sessionId?: string;
  /** 仓库级目录视图信号：传入 repoId 时切换为仓库骨架文件树 */
  repoId?: string;
  /** 仓库名称，用于 repo 模式下的标题展示 */
  repoName?: string;
  /** 当前视图模式：session（默认）展示会话相关文件，repo 展示整仓目录 */
  viewMode?: "session" | "repo";
}

/**
 * 递归过滤文件树节点的辅助函数
 * @param nodes 原始文件节点列表
 * @param query 搜索关键词
 * @returns 过滤后的文件树节点列表，如果文件夹内含有匹配的文件则保留文件夹
 */
function filterFileTree(nodes: MockFsNode[], query: string): MockFsNode[] {
  if (!query.trim()) return nodes;
  const lowerQuery = query.toLowerCase();

  return nodes
    .map((node) => {
      if (node.type === "dir" && node.children) {
        const filteredChildren = filterFileTree(node.children, query);
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
      }
      if (node.name.toLowerCase().includes(lowerQuery)) {
        return node;
      }
      return null;
    })
    .filter((node): node is MockFsNode => node !== null);
}

/**
 * 内存浏览器组件 - 现已改造为 VS Code 风格文件管理器
 * 选中 Session 后，拉取对应的 mock 文件树，渲染左侧树状结构与右侧文件预览
 */
export function MemoryViewer({
  loading,
  sessionTitle,
  sessionId,
  repoId,
  repoName,
  viewMode = "session",
}: MemoryViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<MockFsNode | null>(null);
  const [fileTree, setFileTree] = useState<MockFsNode[]>([]);

  // 根据视图模式选择 mock 文件树数据源：
  // - repo 模式：加载整个仓库的骨架目录，默认预览 README.md
  // - session 模式：加载该会话涉及的文件子集，默认预览首个文本文件
  useEffect(() => {
    // 深度优先搜索（DFS）寻找文件树中第一个文本文件
    const findFirstTextFile = (nodes: MockFsNode[]): MockFsNode | null => {
      for (const node of nodes) {
        if (node.type === "file" && node.fileType === "text") {
          return node;
        }
        if (node.type === "dir" && node.children) {
          const res = findFirstTextFile(node.children);
          if (res) return res;
        }
      }
      return null;
    };

    // 按名称查找文件节点，优先匹配 README.md
    const findByName = (nodes: MockFsNode[], name: string): MockFsNode | null => {
      for (const node of nodes) {
        if (node.type === "file" && node.name.toLowerCase() === name.toLowerCase()) {
          return node;
        }
        if (node.type === "dir" && node.children) {
          const res = findByName(node.children, name);
          if (res) return res;
        }
      }
      return null;
    };

    if (viewMode === "repo" && repoId) {
      const tree = getMockRepoFileTree(repoId);
      setFileTree(tree);
      setSearchQuery("");
      const defaultFile = findByName(tree, "README.md") ?? findFirstTextFile(tree);
      setSelectedFile(defaultFile);
    } else if (sessionId) {
      const tree = getMockFileTree(sessionId);
      setFileTree(tree);
      setSearchQuery("");
      setSelectedFile(findFirstTextFile(tree));
    } else {
      setFileTree([]);
      setSelectedFile(null);
    }
  }, [viewMode, repoId, sessionId]);

  // 根据搜索关键字过滤后的文件树数据
  const filteredTree = useMemo(() => {
    return filterFileTree(fileTree, searchQuery);
  }, [fileTree, searchQuery]);

  // ---------------------------------------------------------------------------
  // 加载骨架屏样式
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col gap-3 pl-4 min-[900px]:pl-10 pr-4 py-4 h-full">
        {/* 头部骨架 */}
        <div className="h-8 rounded bg-surface-3 animate-pulse mb-1" />
        <div className="h-6 rounded bg-surface-3 animate-pulse mb-3" />
        {/* 内容骨架，模拟分栏 */}
        <div className="flex-1 flex gap-4 min-h-0">
          <div className="w-[35%] rounded-lg border border-border-default bg-surface-2/30 p-3 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 bg-surface-3 rounded w-3/4 animate-shimmer" />
            ))}
          </div>
          <div className="flex-1 rounded-lg border border-border-default bg-surface-2/30 p-4 space-y-3">
            <div className="h-4 bg-surface-3 rounded w-1/4 animate-shimmer" />
            <div className="h-3.5 bg-surface-3 rounded w-full animate-shimmer" />
            <div className="h-3.5 bg-surface-3 rounded w-5/6 animate-shimmer" />
            <div className="h-3.5 bg-surface-3 rounded w-4/6 animate-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 未选择会话时的空状态
  // ---------------------------------------------------------------------------
  if (!sessionTitle) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[400px] h-full">
        <div className="relative w-20 h-20 mb-6 flex items-center justify-center text-brand-indigo/35">
          <svg viewBox="0 0 100 100" className="w-16 h-16 animate-brain-glow" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="20" y="20" width="60" height="60" rx="10" />
            <path d="M 35 40 L 65 40 M 35 50 L 65 50 M 35 60 L 50 60" />
          </svg>
          <MessageSquare className="absolute w-6 h-6 text-brand-indigo" />
        </div>
        <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase font-display">
          选择会话日志
        </h3>
        <p className="text-[11px] text-text-muted mt-1.5 max-w-[200px] leading-relaxed">
          从中间栏选择一个会话时序记录，即可在此渲染相应项目文件快照。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* 头部标题与搜索区域 */}
      <div className="pl-4 min-[900px]:pl-10 pr-3 py-3 border-b border-border-default bg-surface-1/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex items-center justify-center w-8.5 h-8.5 rounded-lg border border-brand-indigo/35 bg-brand-indigo/10 text-brand-indigo shadow-[0_0_12px_rgba(122,162,247,0.15)] shrink-0">
            <Terminal className="w-4.5 h-4.5 text-brand-indigo" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-text-primary truncate tracking-wide font-display">
              {sessionTitle}
            </h3>
            <p className="text-[10px] font-mono text-text-secondary mt-0.5">
              {viewMode === "repo"
                ? `Repository Explorer${repoName ? ` · ${repoName}` : ""}`
                : "Explorer Mode (Standalone Mock FS)"}
            </p>
          </div>
        </div>

        {/* 过滤搜索框：放大镜固定在最右侧，搜索词存在时清空按钮自动向左避让，避免重叠 */}
        <div className="relative flex items-center w-full sm:w-[220px]">
          <input
            type="text"
            placeholder="Filter files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="cyber-input w-full pl-3 pr-9 py-1.5 font-sans font-medium placeholder-text-muted/60"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-8 text-text-muted hover:text-text-primary p-0.5 rounded cursor-pointer flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <Search className="absolute right-3 w-4 h-4 text-text-muted pointer-events-none" />
        </div>
      </div>

      {/* 主体分栏区：左侧文件树，右侧预览内容 */}
      <div className="flex-1 flex min-h-0 divide-x divide-border-default/50">
        {/* 左栏 — 递归文件树 */}
        <div className="w-[35%] min-w-[200px] max-w-[320px] shrink-0 overflow-y-auto bg-surface-1/5 backdrop-blur-xs flex flex-col">
          <div className="px-3 py-1.5 border-b border-border-subtle bg-surface-2/20 text-[10px] font-bold tracking-widest text-text-muted font-display uppercase select-none">
            Workspace Files
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <FileTree 
              data={filteredTree} 
              selectedNode={selectedFile} 
              onSelectFile={setSelectedFile} 
            />
          </div>
        </div>

        {/* 右栏 — 文件实时预览 */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-surface-2/5">
          <FilePreview node={selectedFile} />
        </div>
      </div>
    </div>
  );
}
