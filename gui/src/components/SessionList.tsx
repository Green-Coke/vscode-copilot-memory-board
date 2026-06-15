// ============================================================================
// SessionList — Session List Panel with Search
// ============================================================================

import { useState, useMemo, useEffect } from "react";
import type { Session, SortOption } from "@memory-board/core";
import { cn } from "@/lib/utils";
import { MessageSquare, Calendar, ChevronRight, Search, X, FolderTree, Link, FolderOpen } from "lucide-react";
import { PinnedButton } from "@/components/PinnedButton";
import { SortControl } from "@/components/SortControl";
import { sortItems } from "@/lib/sort-utils";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useCopyPath, useRevealInOs } from "@/hooks/use-bridge";
import { FilterDropdown } from "@/components/FilterDropdown";

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (session: Session) => void;
  loading?: boolean;
  /** 当前选中的工作区名称（用于空态判断） */
  workspaceName?: string;
  /** 当前右侧是否处于 "工作区级目录" 视图（高亮入口用） */
  viewingWorkspaceFiles?: boolean;
  /** 点击工作区级目录入口时的回调 */
  onSelectWorkspaceFiles?: () => void;
  /** session 列表排序选项（受控） */
  sortOption: SortOption;
  /** 排序变化回调（受控） */
  onSortChange: (next: SortOption) => void;
  /** 已钉选的 session ID 列表（受控） */
  pinnedIds: string[];
  /** 钉选集合变化回调（受控） */
  onPinnedChange: (next: string[]) => void;
  /** 仅展示有条目的会话（受控） */
  onlyShowWithEntries: boolean;
  /** 切换过滤回调（受控，回写持久层） */
  onOnlyShowWithEntriesChange: (next: boolean) => void;
}

export function SessionList({
  sessions,
  selectedId,
  onSelect,
  loading,
  workspaceName,
  viewingWorkspaceFiles,
  onSelectWorkspaceFiles,
  sortOption,
  onSortChange,
  pinnedIds,
  onPinnedChange,
  onlyShowWithEntries,
  onOnlyShowWithEntriesChange,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const copyPath = useCopyPath();
  const revealInOs = useRevealInOs();

  // ---------------------------------------------------------------------------
  // 分页状态与重置 Effect
  // ---------------------------------------------------------------------------
  const [visibleCount, setVisibleCount] = useState(5);

  // 关键：当搜索词、排序方式或过滤条件改变时，重置分页展示数量为默认 5 项
  useEffect(() => {
    setVisibleCount(5);
  }, [searchQuery, sortOption, onlyShowWithEntries]);

  // 查找到工作区级目录的特殊 session 实例，用于右键复制/打开其路径
  const repoSession = useMemo(() => sessions.find((s) => s.isRepo), [sessions]);

  // ---------------------------------------------------------------------------
  // 搜索过滤 + 仅展示有条目过滤 + 排序 + 钉选分组
  // 钉选项始终排在最上方；钉选组与非钉选组各自按当前 sortOption 排序
  // Session 用 title 作为“名称”参与排序，所以这里传入自定义 getName
  // ---------------------------------------------------------------------------
  const { pinned, unpinned } = useMemo(() => {
    // 1. 过滤掉特殊的 repo 工作区级目录 session 并按搜索词搜索过滤
    let filtered = sessions.filter((session) =>
      !session.isRepo &&
      session.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // 2. 仅保留有条目的会话过滤 (entryCount > 0)
    if (onlyShowWithEntries) {
      filtered = filtered.filter((s) => s.entryCount > 0);
    }

    // 3. 统一排序
    const sortedAll = sortItems(filtered, sortOption, (s) => s.title);

    return {
      pinned: sortedAll.filter((s) => pinnedIds.includes(s.id)),
      unpinned: sortedAll.filter((s) => !pinnedIds.includes(s.id)),
    };
  }, [sessions, searchQuery, sortOption, pinnedIds, onlyShowWithEntries]);

  // 分页：只对 unpinned 列表做 slice 截断，pinned 列表保持全展
  const visibleUnpinned = useMemo(() => {
    return unpinned.slice(0, visibleCount);
  }, [unpinned, visibleCount]);

  const hasMore = unpinned.length > visibleCount;

  /** 切换某 session 的钉选状态 */
  const togglePin = (sessionId: string) => {
    const next = pinnedIds.includes(sessionId)
      ? pinnedIds.filter((id) => id !== sessionId)
      : [...pinnedIds, sessionId];
    onPinnedChange(next);
  };

  // ---------------------------------------------------------------------------
  // Render Loading States
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-3">
        {/* Search skeleton */}
        <div className="h-8 rounded bg-surface-3 animate-pulse mb-1" />
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-lg border border-border-default bg-surface-2/30"
          >
            <div className="w-8 h-8 rounded-full bg-surface-3 animate-shimmer" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3.5 bg-surface-3 rounded w-5/6 animate-shimmer" />
              <div className="h-2.5 bg-surface-3 rounded w-1/3 animate-shimmer" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render Empty State (No Workspace Selected)
  // ---------------------------------------------------------------------------
  if (!workspaceName) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
        <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
          {/* Glowing dotted path illustration */}
          <svg viewBox="0 0 100 100" className="w-14 h-14 text-text-muted/30" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M 20 50 C 35 20, 65 20, 80 50" strokeDasharray="4 4" />
            <path d="M 20 50 C 35 80, 65 80, 80 50" strokeDasharray="4 4" />
          </svg>
          <MessageSquare className="absolute w-5 h-5 text-text-muted/60 animate-bounce" />
        </div>
        <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase font-display">
          等待工作区选择
        </h3>
        <p className="text-[11px] text-text-muted mt-1 max-w-[180px] leading-relaxed">
          请从左侧面板选择一个工作区以扫描其会话记忆。
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render Empty State (No Sessions in selected Workspace)
  // ---------------------------------------------------------------------------
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
        <div className="relative w-16 h-16 mb-4 flex items-center justify-center text-brand-indigo/45">
          <svg viewBox="0 0 100 100" className="w-14 h-14" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="25" y="25" width="50" height="50" rx="6" />
            <line x1="37" y1="42" x2="63" y2="42" />
            <line x1="37" y1="58" x2="55" y2="58" />
          </svg>
          <MessageSquare className="absolute w-4 h-4 text-accent-cyan" />
        </div>
        <h3 className="text-xs font-bold tracking-wider text-text-primary uppercase font-display">
          未找到会话
        </h3>
        <p className="text-[11px] text-text-secondary mt-1.5 max-w-[200px] leading-relaxed">
          在 <span className="text-brand-indigo font-semibold">{workspaceName}</span> 中未发现可用的 Copilot Chat 记忆时间线。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 排序控件：在窄屏单栏模式下合并到 NarrowHeader 渲染以节省空间，非窄屏时在此处显示 */}
      <div className="flex items-center justify-end px-3 pt-3 pb-2 border-b border-border-subtle bg-surface-1/10 min-[500px]:flex hidden">
        <SortControl
          value={sortOption}
          onChange={onSortChange}
          testIdScope="session"
        />
      </div>

      {/* Search Input Box */}
      <div className="p-3 border-b border-border-default bg-surface-1/20 z-10 relative">
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1 flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cyber-input w-full pl-3 pr-9 py-1.5 font-sans font-medium"
              aria-label="搜索会话"
            />
            {/* 搜索放大镜固定在右侧；存在搜索词时清空按钮自动向左避让，避免重叠 */}
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
          <FilterDropdown
            label="只展示有条目的会话"
            checked={onlyShowWithEntries}
            onToggle={onOnlyShowWithEntriesChange}
            testIdScope="session"
          />
        </div>
      </div>

      {/* 工作区级目录独立分区：点击后右侧展示整个工作区的骨架目录，与会话列表视觉分隔 */}
      {onSelectWorkspaceFiles && (
        <div className="px-2.5 pt-2.5">
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
              <button
                onClick={onSelectWorkspaceFiles}
                className={cn(
                  "group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left select-none outline-none cursor-pointer",
                  "transition-all duration-300 ease-out border",
                  viewingWorkspaceFiles
                    ? "bg-selected-bg border-selected-border text-selected-text shadow-[inset_0_1px_10px_var(--ui-selected-glow)]"
                    : "border-transparent hover:bg-surface-3/50 hover:border-border-default text-text-primary"
                )}
                title="查看该工作区的记忆文件目录"
              >
                {viewingWorkspaceFiles && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded bg-selected-text shadow-[0_0_8px_var(--ui-selected-glow)]" />
                )}
                <div
                  className={cn(
                    "flex items-center justify-center w-8.5 h-8.5 rounded-lg border shrink-0 transition-all duration-300",
                    viewingWorkspaceFiles
                      ? "bg-selected-bg-strong border-selected-border text-selected-text"
                      : "bg-surface-2 border-border-default text-text-secondary group-hover:text-brand-indigo group-hover:border-brand-indigo/30"
                  )}
                >
                  <FolderTree className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold font-display truncate tracking-wide">
                    工作区级目录
                  </p>
                  <p className="text-[9px] font-mono text-text-secondary mt-0.5 truncate">
                    点击查看该工作区的记忆文件目录
                  </p>
                </div>
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 text-text-muted transition-all duration-300",
                    "opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0",
                    viewingWorkspaceFiles && "opacity-100 translate-x-0 text-selected-text"
                  )}
                />
              </button>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content
                /* 设置 collisionPadding 防止靠边点击时菜单被视口边缘遮挡 */
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
                <ContextMenu.Item
                  disabled={!repoSession?.absolutePath}
                  onSelect={async (e) => {
                    e.stopPropagation();
                    if (repoSession?.absolutePath) {
                      try {
                        await copyPath(repoSession.absolutePath, false);
                      } catch (err) {
                        console.error("Failed to copy path:", err);
                      }
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 pl-4 pr-3.5 py-1.5 text-[11px] font-mono rounded-sm cursor-pointer",
                    "outline-none select-none transition-colors",
                    !repoSession?.absolutePath
                      ? "text-text-muted/40 cursor-not-allowed"
                      : "text-text-secondary hover:bg-surface-3/60 focus:bg-surface-3/60 hover:text-text-primary"
                  )}
                >
                  <Link className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1">复制路径</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  disabled={!repoSession?.absolutePath}
                  onSelect={async (e) => {
                    e.stopPropagation();
                    if (repoSession?.absolutePath) {
                      try {
                        await revealInOs(repoSession.absolutePath);
                      } catch (err) {
                        console.error("Failed to reveal in OS:", err);
                      }
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 pl-4 pr-3.5 py-1.5 text-[11px] font-mono rounded-sm cursor-pointer",
                    "outline-none select-none transition-colors",
                    !repoSession?.absolutePath
                      ? "text-text-muted/40 cursor-not-allowed"
                      : "text-text-secondary hover:bg-surface-3/60 focus:bg-surface-3/60 hover:text-text-primary"
                  )}
                >
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1">在资源管理器中打开</span>
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
          {/* 分区分隔线，把它和下面的 session 列表在视觉上分开 */}
          <div className="mt-2.5 mb-1 flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-border-subtle" />
            <span className="text-[9px] font-bold tracking-widest text-text-muted font-display uppercase">
              Sessions
            </span>
            <div className="h-px flex-1 bg-border-subtle" />
          </div>
        </div>
      )}

      {/* Session Item List Container */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
        {pinned.length === 0 && unpinned.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center font-mono text-[11px] text-text-muted">
            No matching sessions found
          </div>
        ) : (
          <>
            {/* 钉选分组 */}
            {pinned.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-1 pt-1">
                  <div className="h-px flex-1 bg-amber-500/30" />
                  <span className="text-[9px] font-bold tracking-widest text-amber-500/80 font-display uppercase">
                    Pinned
                  </span>
                  <div className="h-px flex-1 bg-amber-500/30" />
                </div>
                {pinned.map((session, index) => renderSession(session, index, true))}
              </>
            )}
            {/* 非钉选分组 */}
            {visibleUnpinned.map((session, index) => renderSession(session, index, false))}

            {/* 加载更多按钮：当未展示项大于当前展示项时呈现，呼应 Cyber 风格的微弱发光 */}
            {hasMore && (
              <button
                data-testid="load-more-sessions"
                onClick={() => setVisibleCount((c) => c + 5)}
                className={cn(
                  "w-full py-2 px-4 mt-1 rounded-lg cursor-pointer text-center font-mono text-[10px] font-bold tracking-wider",
                  "transition-all duration-300",
                  "bg-gradient-to-r from-brand-indigo/10 to-brand-purple/10 border border-brand-indigo/35 text-brand-indigo hover:text-brand-indigo/90 hover:from-brand-indigo/15 hover:to-brand-purple/15",
                  "shadow-[0_0_8px_rgba(99,102,241,0.1)] hover:shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                )}
              >
                加载更多（剩余 {unpinned.length - visibleCount} 项）
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  /**
   * 渲染单个 session 条目
   */
  function renderSession(session: Session, index: number, isPinned: boolean) {
    const isSelected = selectedId === session.id;
    const sessionPinned = pinnedIds.includes(session.id);

    // 复制会话物理目录的路径
    const handleCopyPath = async (e: Event) => {
      e.stopPropagation();
      if (session.absolutePath) {
        try {
          await copyPath(session.absolutePath, false);
        } catch (err) {
          console.error("Failed to copy path:", err);
        }
      }
    };

    // 在系统资源管理器中打开会话物理目录
    const handleRevealInOs = async (e: Event) => {
      e.stopPropagation();
      if (session.absolutePath) {
        try {
          await revealInOs(session.absolutePath);
        } catch (err) {
          console.error("Failed to reveal in OS:", err);
        }
      }
    };

    return (
      <ContextMenu.Root key={session.id}>
        <ContextMenu.Trigger asChild>
          <div
            data-testid={`session-item-${session.id}`}
            onClick={() => onSelect(session)}
            className={cn(
              "group relative flex items-center gap-3 px-3 py-3 rounded-lg text-left select-none outline-none cursor-pointer",
              "transition-all duration-300 ease-out",
              "animate-fade-in",
              isSelected
                ? "bg-selected-bg border border-selected-border text-selected-text shadow-[inset_0_1px_10px_var(--ui-selected-glow)]"
                : "border border-transparent hover:bg-surface-3/50 hover:border-border-default hover:scale-[1.01] active:scale-[0.99] text-text-primary"
            )}
            style={{ animationDelay: `${index * 40}ms` }}
          >
            {/* Visual Glow line on left border for selected item */}
            {isSelected && (
              <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded bg-selected-text shadow-[0_0_8px_var(--ui-selected-glow)]" />
            )}

            {/* 钉选指示条，仅钉选项显示 */}
            {isPinned && (
              <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded bg-amber-500/70" />
            )}

            {/* Left speech bubble container */}
            <div
              className={cn(
                "flex items-center justify-center w-8.5 h-8.5 rounded-lg border shrink-0",
                "transition-all duration-300",
                isSelected
                  ? "bg-selected-bg-strong border-selected-border text-selected-text"
                  : "bg-surface-2 border-border-default text-text-secondary group-hover:text-brand-indigo group-hover:border-brand-indigo/30"
              )}
            >
              <MessageSquare className="w-4 h-4" />
            </div>

            {/* Session title and metadata */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold font-display truncate tracking-wide">
                {session.title}
              </p>
              <div className="flex items-center gap-2 mt-1.5 font-mono text-[9px] text-text-secondary">
                <span className="flex items-center gap-1 font-semibold text-brand-indigo/80">
                  {session.entryCount} entries
                </span>
                <span className="text-text-muted">•</span>
                <span className="flex items-center gap-0.5 text-text-muted">
                  <Calendar className="w-2.5 h-2.5" />
                  {formatDate(session.createdAt)}
                </span>
              </div>
            </div>

            {/* 钉选按钮 */}
            <PinnedButton
              pinned={sessionPinned}
              onClick={() => togglePin(session.id)}
              testIdScope="session"
              itemId={session.id}
            />

            {/* Chevron marker indicator */}
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 text-text-muted transition-all duration-300",
                "opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0",
                isSelected && "opacity-100 translate-x-0 text-selected-text"
              )}
            />
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            /* 设置 collisionPadding 防止靠边点击时菜单被视口边缘遮挡 */
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
            <ContextMenu.Item
              disabled={!session.absolutePath}
              onSelect={handleCopyPath}
              className={cn(
                "flex items-center gap-3 pl-4 pr-3.5 py-1.5 text-[11px] font-mono rounded-sm cursor-pointer",
                "outline-none select-none transition-colors",
                !session.absolutePath
                  ? "text-text-muted/40 cursor-not-allowed"
                  : "text-text-secondary hover:bg-surface-3/60 focus:bg-surface-3/60 hover:text-text-primary"
              )}
            >
              <Link className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">复制路径</span>
            </ContextMenu.Item>
            <ContextMenu.Item
              disabled={!session.absolutePath}
              onSelect={handleRevealInOs}
              className={cn(
                "flex items-center gap-3 pl-4 pr-3.5 py-1.5 text-[11px] font-mono rounded-sm cursor-pointer",
                "outline-none select-none transition-colors",
                !session.absolutePath
                  ? "text-text-muted/40 cursor-not-allowed"
                  : "text-text-secondary hover:bg-surface-3/60 focus:bg-surface-3/60 hover:text-text-primary"
              )}
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">在资源管理器中打开</span>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  }
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
