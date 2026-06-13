// ============================================================================
// RepoList — Repository List Panel with Search
// ============================================================================

import { useState, useMemo } from "react";
import type { Repository, SortOption } from "@memory-board/core";
import { cn } from "@/lib/utils";
import { FolderGit2, Clock, ChevronRight, Search, X } from "lucide-react";
import { PinnedButton } from "@/components/PinnedButton";
import { SortControl } from "@/components/SortControl";
import { sortItems } from "@/lib/sort-utils";

interface RepoListProps {
  repos: Repository[];
  selectedId: string | null;
  onSelect: (repo: Repository) => void;
  loading?: boolean;
  /** 仓库列表排序选项（受控） */
  sortOption: SortOption;
  /** 排序变化回调（受控） */
  onSortChange: (next: SortOption) => void;
  /** 已钉选的仓库 ID 列表（受控） */
  pinnedIds: string[];
  /** 钉选集合变化回调（受控） */
  onPinnedChange: (next: string[]) => void;
}

export function RepoList({
  repos,
  selectedId,
  onSelect,
  loading,
  sortOption,
  onSortChange,
  pinnedIds,
  onPinnedChange,
}: RepoListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // ---------------------------------------------------------------------------
  // 搜索过滤 + 排序 + 钉选分组
  // 钉选项始终排在最上方；钉选组与非钉选组各自按当前 sortOption 排序
  // ---------------------------------------------------------------------------
  const { pinned, unpinned } = useMemo(() => {
    const filtered = repos.filter((repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const sortedAll = sortItems(filtered, sortOption);
    return {
      pinned: sortedAll.filter((r) => pinnedIds.includes(r.id)),
      unpinned: sortedAll.filter((r) => !pinnedIds.includes(r.id)),
    };
  }, [repos, searchQuery, sortOption, pinnedIds]);

  /** 切换某仓库的钉选状态 */
  const togglePin = (repoId: string) => {
    const next = pinnedIds.includes(repoId)
      ? pinnedIds.filter((id) => id !== repoId)
      : [...pinnedIds, repoId];
    onPinnedChange(next);
  };

  // ---------------------------------------------------------------------------
  // Render Loading States (Futuristic Skeletons)
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-3">
        {/* Search skeleton */}
        <div className="h-8 rounded bg-surface-3 animate-pulse mb-1" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-lg border border-border-default bg-surface-2/30"
          >
            <div className="w-8 h-8 rounded bg-surface-3 animate-shimmer" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3.5 bg-surface-3 rounded w-3/4 animate-shimmer" />
              <div className="h-2.5 bg-surface-3 rounded w-1/2 animate-shimmer" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render Empty State
  // ---------------------------------------------------------------------------
  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
        {/* Futuristic SVG Radar scan illustration */}
        <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-16 h-16 text-brand-indigo/35 animate-spin duration-10000" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="50" cy="50" r="40" strokeDasharray="6 6" />
            <circle cx="50" cy="50" r="25" />
            <line x1="50" y1="10" x2="50" y2="90" />
            <line x1="10" y1="50" x2="90" y2="50" />
          </svg>
          <FolderGit2 className="absolute w-6 h-6 text-brand-indigo animate-pulse" />
        </div>
        <h3 className="text-xs font-bold tracking-wider text-text-primary uppercase font-display">
          No repositories scanned
        </h3>
        <p className="text-[11px] text-text-secondary mt-1.5 max-w-[200px] leading-relaxed">
          Copilot local workspace memory storage will automatically synchronize here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 排序控件 */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border-subtle bg-surface-1/10">
        <span className="text-[10px] font-bold tracking-widest text-text-muted font-display uppercase">
          Sort
        </span>
        <SortControl
          value={sortOption}
          onChange={onSortChange}
          testIdScope="repo"
        />
      </div>

      {/* Search Input Box */}
      <div className="p-3 border-b border-border-default bg-surface-1/20 z-10 relative">
        <div className="relative flex items-center w-full">
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="cyber-input w-full pl-3 pr-9 py-1.5 font-sans font-medium placeholder-text-muted/60"
          />
          {/* 存在搜索词时清空按钮自动向左避让，放大镜固定在最右侧，避免二者重叠 */}
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

      {/* Repo Item List Container */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
        {pinned.length === 0 && unpinned.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center font-mono text-[11px] text-text-muted">
            No matching repos found
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
                {pinned.map((repo, index) =>
                  renderRepo(repo, index, true)
                )}
                {unpinned.length > 0 && (
                  <div className="flex items-center gap-2 px-1 mt-2">
                    <div className="h-px flex-1 bg-border-subtle" />
                    <span className="text-[9px] font-bold tracking-widest text-text-muted font-display uppercase">
                      Repositories
                    </span>
                    <div className="h-px flex-1 bg-border-subtle" />
                  </div>
                )}
              </>
            )}
            {/* 非钉选分组 */}
            {unpinned.map((repo, index) =>
              renderRepo(repo, index, false)
            )}
          </>
        )}
      </div>
    </div>
  );

  /**
   * 渲染单个仓库条目
   */
  function renderRepo(repo: Repository, index: number, isPinned: boolean) {
    const isSelected = selectedId === repo.id;
    const repoPinned = pinnedIds.includes(repo.id);

    return (
      <div
        key={repo.id}
        data-testid={`repo-item-${repo.id}`}
        className={cn(
          "group relative flex items-center gap-2 px-3 py-3 rounded-lg text-left select-none outline-none cursor-pointer",
          "transition-all duration-300 ease-out",
          "animate-fade-in",
          isSelected
            ? "bg-selected-bg border border-selected-border text-selected-text shadow-[inset_0_1px_10px_var(--ui-selected-glow)]"
            : "border border-transparent hover:bg-surface-3/50 hover:border-border-default hover:scale-[1.01] active:scale-[0.99] text-text-primary"
        )}
        style={{ animationDelay: `${index * 40}ms` }}
        onClick={() => onSelect(repo)}
        title={repo.path}
      >
        {/* Visual Glow line on left border for selected item */}
        {isSelected && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded bg-selected-text shadow-[0_0_8px_var(--ui-selected-glow)]" />
        )}

        {/* 钉选指示条，仅钉选项显示 */}
        {isPinned && (
          <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded bg-amber-500/70" />
        )}

        {/* Left Folder icon container with status */}
        <div
          className={cn(
            "relative flex items-center justify-center w-8.5 h-8.5 rounded-lg border",
            "transition-all duration-300",
            isSelected
              ? "bg-selected-bg-strong border-selected-border text-selected-text"
              : "bg-surface-2 border-border-default text-text-secondary group-hover:text-brand-indigo group-hover:border-brand-indigo/30"
          )}
        >
          <FolderGit2 className="w-4 h-4" />
        </div>

        {/* Central repository details */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold font-display truncate tracking-wide">
            {repo.name}
          </p>
          <div className="flex items-center gap-2 mt-1 font-mono text-[9px] text-text-secondary">
            <span className="flex items-center gap-1 font-semibold text-brand-indigo/80">
              {repo.sessionCount} sessions
            </span>
            <span className="text-text-muted">•</span>
            <span className="flex items-center gap-0.5 text-text-muted">
              <Clock className="w-2.5 h-2.5" />
              {formatRelativeTime(repo.lastModified)}
            </span>
          </div>
          {/* Truncated workspace folder path display */}
          <span className="block text-[8px] font-mono text-text-muted/65 truncate mt-0.5">
            {repo.path}
          </span>
        </div>

        {/* 钉选按钮 */}
        <PinnedButton
          pinned={repoPinned}
          onClick={() => togglePin(repo.id)}
          testIdScope="repo"
          itemId={repo.id}
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
    );
  }
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
