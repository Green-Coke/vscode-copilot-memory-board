// ============================================================================
// RepoList — Repository List Panel
// ============================================================================

import type { Repository } from "@memory-board/core";
import { cn } from "@/lib/utils";
import { FolderGit2, Clock, ChevronRight } from "lucide-react";

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
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-lg bg-surface-3 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-text-muted">
        <FolderGit2 className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">No repositories found</p>
        <p className="text-xs mt-1">Copilot memory data will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 p-2">
      {repos.map((repo, index) => (
        <button
          key={repo.id}
          onClick={() => onSelect(repo)}
          className={cn(
            "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left",
            "transition-all duration-200",
            "hover:bg-surface-3 hover:scale-[1.01]",
            "active:scale-[0.99]",
            "animate-fade-in",
            selectedId === repo.id
              ? "bg-brand-600/15 border border-brand-500/30 text-brand-300"
              : "border border-transparent text-text-primary"
          )}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md",
              "transition-colors duration-200",
              selectedId === repo.id
                ? "bg-brand-500/20 text-brand-400"
                : "bg-surface-3 text-text-secondary group-hover:text-brand-400"
            )}
          >
            <FolderGit2 className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{repo.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-text-muted">
                {repo.sessionCount} sessions
              </span>
              <span className="text-xs text-text-muted flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(repo.lastModified)}
              </span>
            </div>
          </div>

          <ChevronRight
            className={cn(
              "w-4 h-4 text-text-muted transition-all duration-200",
              "opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0",
              selectedId === repo.id && "opacity-100 translate-x-0 text-brand-400"
            )}
          />
        </button>
      ))}
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
