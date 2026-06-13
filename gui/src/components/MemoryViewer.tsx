// ============================================================================
// MemoryViewer — Memory Entry Content Viewer
// ============================================================================

import type { MemoryEntry, MemoryCategory } from "@memory-board/core";
import { cn } from "@/lib/utils";
import { FileText, Tag } from "lucide-react";

interface MemoryViewerProps {
  entries: MemoryEntry[];
  loading?: boolean;
  sessionTitle?: string;
}

const categoryLabels: Record<MemoryCategory, string> = {
  preference: "Preference",
  context: "Context",
  instruction: "Instruction",
  knowledge: "Knowledge",
  pattern: "Pattern",
  unknown: "Unknown",
};

export function MemoryViewer({
  entries,
  loading,
  sessionTitle,
}: MemoryViewerProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-lg bg-surface-3 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-text-muted">
        <FileText className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">
          {sessionTitle ? "No entries in this session" : "Select a session"}
        </p>
        <p className="text-xs mt-1">Memory entries will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {sessionTitle && (
        <div className="flex items-center gap-2 px-1 mb-1">
          <h3 className="text-sm font-semibold text-text-primary truncate">
            {sessionTitle}
          </h3>
          <span className="text-xs text-text-muted shrink-0">
            {entries.length} entries
          </span>
        </div>
      )}

      {entries.map((entry, index) => (
        <article
          key={entry.id}
          className={cn(
            "glass-panel p-4 animate-fade-in",
            "transition-all duration-200",
            "hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5"
          )}
          style={{ animationDelay: `${index * 80}ms` }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
                `badge-${entry.category}`
              )}
            >
              <Tag className="w-3 h-3" />
              {categoryLabels[entry.category]}
            </span>
            <span className="text-xs text-text-muted">{entry.sourceFile}</span>
          </div>

          {/* Content */}
          <p className="text-sm text-text-primary leading-relaxed">
            {entry.content}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border-subtle">
            <span className="text-xs text-text-muted">
              {new Date(entry.timestamp).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-xs text-text-muted font-mono">
              {entry.id}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
