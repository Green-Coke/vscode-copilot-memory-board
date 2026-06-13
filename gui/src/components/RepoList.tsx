// ============================================================================
// RepoList — Repository List Panel with Search
// ============================================================================

import { useState } from "react";
import type { Repository } from "@memory-board/core";
import { cn } from "@/lib/utils";
import { FolderGit2, Clock, ChevronRight, Search, X } from "lucide-react";

interface RepoListProps {
  repos: Repository[];
  selectedId: string | null;
  onSelect: (repo: Repository) => void;
  loading?: boolean;
}

export function RepoList({
  repos,
  selectedId,
  onSelect,
  loading,
}: RepoListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // ---------------------------------------------------------------------------
  // Search Filtering
  // ---------------------------------------------------------------------------
  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Identify the most recently modified repository to mark with an active pulse dot
  const newestRepoId = repos.length > 0
    ? [...repos].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())[0]?.id ?? null
    : null;

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
      {/* Search Input Box */}
      <div className="p-3 border-b border-border-default bg-surface-1/20 z-10 relative">
        <div className="relative flex items-center w-full">
          <Search className="absolute left-2.5 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="cyber-input w-full pl-8 pr-8 py-1.5 font-sans font-medium placeholder-text-muted/60"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-text-muted hover:text-text-primary p-0.5 rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Repo Item List Container */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
        {filteredRepos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center font-mono text-[11px] text-text-muted">
            No matching repos found
          </div>
        ) : (
          filteredRepos.map((repo, index) => {
            const isSelected = selectedId === repo.id;
            const isNewest = repo.id === newestRepoId;

            return (
              <button
                key={repo.id}
                onClick={() => onSelect(repo)}
                title={repo.path}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-3 rounded-lg text-left select-none outline-none cursor-pointer",
                  "transition-all duration-300 ease-out",
                  "animate-fade-in",
                  isSelected
                    ? "bg-brand-indigo/10 border border-brand-indigo/25 text-brand-indigo shadow-[inset_0_1px_10px_rgba(99,102,241,0.05)]"
                    : "border border-transparent hover:bg-surface-3/50 hover:border-border-default hover:scale-[1.01] active:scale-[0.99] text-text-primary"
                )}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {/* Visual Glow line on left border for selected item */}
                {isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded bg-brand-indigo shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                )}

                {/* Left Folder icon container with status */}
                <div
                  className={cn(
                    "relative flex items-center justify-center w-8.5 h-8.5 rounded-lg border",
                    "transition-all duration-300",
                    isSelected
                      ? "bg-brand-indigo/20 border-brand-indigo/40 text-brand-indigo"
                      : "bg-surface-2 border-border-default text-text-secondary group-hover:text-brand-indigo group-hover:border-brand-indigo/30"
                  )}
                >
                  <FolderGit2 className="w-4 h-4" />
                  
                  {/* Glowing active marker dot */}
                  {isNewest && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  )}
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

                {/* Chevron marker indicator */}
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 text-text-muted transition-all duration-300",
                    "opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0",
                    isSelected && "opacity-100 translate-x-0 text-brand-indigo"
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
