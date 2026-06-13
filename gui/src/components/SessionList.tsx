// ============================================================================
// SessionList — Session List Panel with Search
// ============================================================================

import { useState } from "react";
import type { Session } from "@memory-board/core";
import { cn } from "@/lib/utils";
import { MessageSquare, Calendar, ChevronRight, Search, X, FolderTree } from "lucide-react";

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (session: Session) => void;
  loading?: boolean;
  repoName?: string;
  /** 当前右侧是否处于 "仓库级目录" 视图（高亮入口用） */
  viewingRepoFiles?: boolean;
  /** 点击仓库级目录入口时的回调 */
  onSelectRepoFiles?: () => void;
}

export function SessionList({
  sessions,
  selectedId,
  onSelect,
  loading,
  repoName,
  viewingRepoFiles,
  onSelectRepoFiles,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // ---------------------------------------------------------------------------
  // Search Filtering
  // ---------------------------------------------------------------------------
  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
  // Render Empty State (No Repo Selected)
  // ---------------------------------------------------------------------------
  if (!repoName) {
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
          Awaiting Repository
        </h3>
        <p className="text-[11px] text-text-muted mt-1 max-w-[180px] leading-relaxed">
          Select a repository from the left panel to scan its memory sessions.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render Empty State (No Sessions in selected Repo)
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
          No Sessions Found
        </h3>
        <p className="text-[11px] text-text-secondary mt-1.5 max-w-[200px] leading-relaxed">
          No active Copilot chat memory timelines found inside <span className="text-brand-indigo font-semibold">{repoName}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Input Box */}
      <div className="p-3 border-b border-border-default bg-surface-1/20 z-10 relative">
        <div className="relative flex items-center w-full">
          <input
            type="text"
            placeholder={`Search sessions in ${repoName}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="cyber-input w-full pl-3 pr-9 py-1.5 font-sans font-medium placeholder-text-muted/60"
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
      </div>

      {/* 仓库级目录独立分区：点击后右侧展示整个仓库的骨架目录，与会话列表视觉分隔 */}
      {onSelectRepoFiles && (
        <div className="px-2.5 pt-2.5">
          <button
            onClick={onSelectRepoFiles}
            className={cn(
              "group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left select-none outline-none cursor-pointer",
              "transition-all duration-300 ease-out border",
              viewingRepoFiles
                ? "bg-selected-bg border-selected-border text-selected-text shadow-[inset_0_1px_10px_var(--ui-selected-glow)]"
                : "border-transparent hover:bg-surface-3/50 hover:border-border-default text-text-primary"
            )}
            title="查看整个仓库的文件结构"
          >
            {viewingRepoFiles && (
              <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded bg-selected-text shadow-[0_0_8px_var(--ui-selected-glow)]" />
            )}
            <div
              className={cn(
                "flex items-center justify-center w-8.5 h-8.5 rounded-lg border shrink-0 transition-all duration-300",
                viewingRepoFiles
                  ? "bg-selected-bg-strong border-selected-border text-selected-text"
                  : "bg-surface-2 border-border-default text-text-secondary group-hover:text-brand-indigo group-hover:border-brand-indigo/30"
              )}
            >
              <FolderTree className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold font-display truncate tracking-wide">
                仓库级目录
              </p>
              <p className="text-[9px] font-mono text-text-secondary mt-0.5 truncate">
                点击查看整个仓库的文件结构
              </p>
            </div>
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 text-text-muted transition-all duration-300",
                "opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0",
                viewingRepoFiles && "opacity-100 translate-x-0 text-selected-text"
              )}
            />
          </button>
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
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center font-mono text-[11px] text-text-muted">
            No matching sessions found
          </div>
        ) : (
          filteredSessions.map((session, index) => {
            const isSelected = selectedId === session.id;

            return (
              <button
                key={session.id}
                onClick={() => onSelect(session)}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-3 rounded-lg text-left select-none outline-none cursor-pointer",
                  "transition-all duration-300 ease-out",
                  "animate-fade-in",
                  isSelected
                    ? "bg-selected-bg border border-selected-border text-selected-text shadow-[inset_0_1px_10px_var(--ui-selected-glow)]"
                    : "border border-transparent hover:bg-surface-3/50 hover:border-border-default hover:scale-[1.01] active:scale-[0.99] text-text-primary"
                )}
                // Apply stagger delays so list ripples into view
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {/* Visual Glow line on left border for selected item */}
                {isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded bg-selected-text shadow-[0_0_8px_var(--ui-selected-glow)]" />
                )}

                {/* Left speech bubble container */}
                <div
                  className={cn(
                    "flex items-center justify-center w-8.5 h-8.5 rounded-lg border",
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

                {/* Chevron marker indicator */}
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 text-text-muted transition-all duration-300",
                    "opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0",
                    isSelected && "opacity-100 translate-x-0 text-selected-text"
                  )}
                />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
