// ============================================================================
// SessionList — Session List Panel
// ============================================================================

import type { Session } from "@memory-board/core";
import { cn } from "@/lib/utils";
import { MessageSquare, Calendar, ChevronRight } from "lucide-react";

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (session: Session) => void;
  loading?: boolean;
  repoName?: string;
}

export function SessionList({
  sessions,
  selectedId,
  onSelect,
  loading,
  repoName,
}: SessionListProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 rounded-lg bg-surface-3 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-text-muted">
        <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">
          {repoName ? `No sessions in ${repoName}` : "Select a repository"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 p-2">
      {sessions.map((session, index) => (
        <button
          key={session.id}
          onClick={() => onSelect(session)}
          className={cn(
            "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left",
            "transition-all duration-200",
            "hover:bg-surface-3 hover:scale-[1.01]",
            "active:scale-[0.99]",
            "animate-fade-in",
            selectedId === session.id
              ? "bg-brand-600/15 border border-brand-500/30 text-brand-300"
              : "border border-transparent text-text-primary"
          )}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md",
              "transition-colors duration-200",
              selectedId === session.id
                ? "bg-brand-500/20 text-brand-400"
                : "bg-surface-3 text-text-secondary group-hover:text-brand-400"
            )}
          >
            <MessageSquare className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{session.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-text-muted">
                {session.entryCount} entries
              </span>
              <span className="text-xs text-text-muted flex items-center gap-0.5">
                <Calendar className="w-3 h-3" />
                {formatDate(session.createdAt)}
              </span>
            </div>
          </div>

          <ChevronRight
            className={cn(
              "w-4 h-4 text-text-muted transition-all duration-200",
              "opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0",
              selectedId === session.id && "opacity-100 translate-x-0 text-brand-400"
            )}
          />
        </button>
      ))}
    </div>
  );
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
