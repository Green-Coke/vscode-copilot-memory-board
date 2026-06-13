// ============================================================================
// MemoryViewer — Memory Entry Content Viewer
// ============================================================================

import { useState, useEffect } from "react";
import type { MemoryEntry, MemoryCategory } from "@memory-board/core";
import { cn } from "@/lib/utils";
import { 
  FileText, Tag, Copy, Check, Star, Search, X, 
  Clock, BookOpen, Info, ChevronRight, Terminal 
} from "lucide-react";

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

const categoryDescriptions: Record<MemoryCategory, string> = {
  preference: "Coding styles, syntax preferences, or tool configurations favored by the user.",
  context: "Project configurations, build guidelines, library versions, or local setup specifications.",
  instruction: "Direct prompts or rules that command Copilot's generation behavior.",
  knowledge: "Domain facts, API structure information, server architecture details, or algorithmic choices.",
  pattern: "Preferred design patterns (e.g., barrel exports, React Server Components structure).",
  unknown: "Unclassified metadata parsed from chat sessions.",
};

// Helper to escape regex special characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Text Highlighter Component
// ---------------------------------------------------------------------------
function HighlightedText({ text, search }: { text: string; search: string }) {
  if (!search.trim()) return <>{text}</>;
  
  const regex = new RegExp(`(${escapeRegExp(search)})`, "gi");
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <mark key={i} className="bg-brand-indigo/30 text-text-primary px-0.5 rounded font-semibold border-b border-brand-indigo/40">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Individual Memory Card Component
// ---------------------------------------------------------------------------
interface MemoryCardProps {
  entry: MemoryEntry;
  searchQuery: string;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  onCopy: (id: string, text: string) => void;
  isCopied: boolean;
  onOpenDetails: (entry: MemoryEntry) => void;
}

function MemoryCard({
  entry,
  searchQuery,
  isBookmarked,
  onToggleBookmark,
  onCopy,
  isCopied,
  onOpenDetails,
}: MemoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const needsExpansion = entry.content.length > 180;
  const displayedContent = isExpanded 
    ? entry.content 
    : entry.content.slice(0, 180) + (needsExpansion ? "..." : "");

  return (
    <article
      className={cn(
        "glass-panel p-4 animate-fade-in glass-panel-hover flex flex-col gap-3 group/card relative",
        isBookmarked && "border-rose-500/20 shadow-[0_0_12px_-5px_rgba(244,63,94,0.1)]"
      )}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider uppercase",
            `badge-${entry.category}`
          )}
        >
          <Tag className="w-2.5 h-2.5" />
          {categoryLabels[entry.category]}
        </span>
        
        <div className="flex items-center gap-2">
          {/* Quick source file indicator */}
          <span className="text-[10px] font-mono text-text-muted truncate max-w-[120px] hidden sm:inline" title={entry.sourceFile}>
            {entry.sourceFile}
          </span>
          
          {/* Bookmark Trigger */}
          <button
            onClick={() => onToggleBookmark(entry.id)}
            className={cn(
              "p-1 rounded hover:bg-surface-3 transition-colors cursor-pointer",
              isBookmarked ? "text-rose-500" : "text-text-muted hover:text-rose-400"
            )}
            title={isBookmarked ? "Remove bookmark" : "Bookmark memory"}
          >
            <Star className={cn("w-3.5 h-3.5", isBookmarked && "fill-current")} />
          </button>

          {/* Copy Trigger */}
          <button
            onClick={() => onCopy(entry.id, entry.content)}
            className="p-1 rounded hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            title="Copy content"
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="text-xs text-text-primary leading-relaxed break-words font-sans">
        <HighlightedText text={displayedContent} search={searchQuery} />
        {needsExpansion && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-brand-indigo hover:text-accent-cyan text-[10px] font-bold ml-1.5 hover:underline font-mono inline-block cursor-pointer"
          >
            {isExpanded ? "[Collapse]" : "[Read More]"}
          </button>
        )}
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between mt-1 pt-2 border-t border-border-subtle font-mono text-[9px] text-text-secondary">
        <span className="flex items-center gap-1 text-text-muted">
          <Clock className="w-2.5 h-2.5" />
          {new Date(entry.timestamp).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <button
          onClick={() => onOpenDetails(entry)}
          className="flex items-center gap-0.5 text-text-muted hover:text-brand-indigo font-bold transition-colors cursor-pointer uppercase tracking-wider"
        >
          Details
          <ChevronRight className="w-2.5 h-2.5" />
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main MemoryViewer Component
// ---------------------------------------------------------------------------
export function MemoryViewer({
  entries,
  loading,
  sessionTitle,
}: MemoryViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<MemoryEntry | null>(null);
  
  // Bookmarks state persisted in localStorage
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("memory_bookmarks") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("memory_bookmarks", JSON.stringify(bookmarkedIds));
  }, [bookmarkedIds]);

  // Handle Copy Actions
  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle Bookmark logic
  const handleToggleBookmark = (id: string) => {
    setBookmarkedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // ---------------------------------------------------------------------------
  // Filtering Logic
  // ---------------------------------------------------------------------------
  const filteredEntries = entries.filter((entry) => {
    // 1. Search Query filter
    const matchesSearch = entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          entry.sourceFile.toLowerCase().includes(searchQuery.toLowerCase());
    
    // 2. Category Pill filter
    if (selectedCategory === "all") return matchesSearch;
    if (selectedCategory === "bookmarks") {
      return bookmarkedIds.includes(entry.id) && matchesSearch;
    }
    return entry.category === selectedCategory && matchesSearch;
  });

  // ---------------------------------------------------------------------------
  // Loading Skeletons
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="h-8 rounded bg-surface-3 animate-pulse mb-1" />
        <div className="h-6 rounded bg-surface-3 animate-pulse mb-3" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-border-default bg-surface-2/30 space-y-3"
          >
            <div className="flex justify-between">
              <div className="h-4 bg-surface-3 rounded w-1/4 animate-shimmer" />
              <div className="h-4 bg-surface-3 rounded w-1/6 animate-shimmer" />
            </div>
            <div className="h-3.5 bg-surface-3 rounded w-full animate-shimmer" />
            <div className="h-3.5 bg-surface-3 rounded w-5/6 animate-shimmer" />
            <div className="h-3 bg-surface-3 rounded w-1/3 animate-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Session Not Selected Empty State
  // ---------------------------------------------------------------------------
  if (!sessionTitle) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
        <div className="relative w-20 h-20 mb-6 flex items-center justify-center text-brand-indigo/35">
          <svg viewBox="0 0 100 100" className="w-16 h-16 animate-brain-glow" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="20" y="20" width="60" height="60" rx="10" />
            <path d="M 35 40 L 65 40 M 35 50 L 65 50 M 35 60 L 50 60" />
          </svg>
          <FileText className="absolute w-6 h-6 text-brand-indigo" />
        </div>
        <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase font-display">
          Select Conversation Log
        </h3>
        <p className="text-[11px] text-text-muted mt-1.5 max-w-[200px] leading-relaxed">
          Choose a conversation session from the middle column to render memory snapshots.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header Search & Title */}
      <div className="p-3 border-b border-border-default bg-surface-1/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-text-primary truncate tracking-wide font-display">
            {sessionTitle}
          </h3>
          <p className="text-[10px] font-mono text-text-secondary mt-0.5">
            {entries.length} entries parsed
          </p>
        </div>

        {/* Local Search Input */}
        <div className="relative flex items-center w-full sm:w-[220px]">
          <Search className="absolute left-2.5 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search entries..."
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

      {/* Category Horizontal Filter Bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-subtle bg-surface-2/10 overflow-x-auto whitespace-nowrap scrollbar-none">
        <span className="text-[9px] font-bold text-text-secondary font-display uppercase tracking-widest mr-1">
          Filter:
        </span>
        <button
          onClick={() => setSelectedCategory("all")}
          className={cn(
            "px-2.5 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer font-mono",
            selectedCategory === "all"
              ? "bg-brand-indigo/15 border-brand-indigo/35 text-brand-indigo shadow-[0_0_8px_rgba(99,102,241,0.15)]"
              : "border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover"
          )}
        >
          All
        </button>
        {(Object.keys(categoryLabels) as MemoryCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              "px-2.5 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer font-mono",
              selectedCategory === cat
                ? `badge-${cat} shadow-[0_0_8px_color-mix(in_srgb,var(--color-category-${cat})_30%,transparent)]`
                : "border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover"
            )}
          >
            {categoryLabels[cat]}
          </button>
        ))}
        {/* Bookmarks Filter chip */}
        <button
          onClick={() => setSelectedCategory("bookmarks")}
          className={cn(
            "px-2.5 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer flex items-center gap-1 font-mono",
            selectedCategory === "bookmarks"
              ? "bg-rose-500/15 border-rose-500/35 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.15)]"
              : "border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover"
          )}
        >
          <Star className="w-2.5 h-2.5 fill-current" />
          Bookmarks ({bookmarkedIds.length})
        </button>
      </div>

      {/* Scrollable Entry Cards */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center font-mono text-[11px] text-text-muted">
            <BookOpen className="w-8 h-8 mb-3 opacity-30 text-text-muted" />
            No matching memory logs found.
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <MemoryCard
              key={entry.id}
              entry={entry}
              searchQuery={searchQuery}
              isBookmarked={bookmarkedIds.includes(entry.id)}
              onToggleBookmark={handleToggleBookmark}
              onCopy={handleCopy}
              isCopied={copiedId === entry.id}
              onOpenDetails={setSelectedEntry}
            />
          ))
        )}
      </div>

      {/* ====================================================================
         Detail Slide-out Drawer Overlay
         ==================================================================== */}
      {selectedEntry && (
        <>
          {/* Clickable Backdrop to close */}
          <div
            onClick={() => setSelectedEntry(null)}
            className="absolute inset-0 bg-surface-0/60 backdrop-blur-sm z-40 transition-opacity"
          />
          
          {/* Drawer container */}
          <div className="absolute right-0 top-0 bottom-0 h-full w-[310px] max-w-full bg-surface-2 border-l border-border-default shadow-2xl z-50 flex flex-col animate-slide-in">
            {/* Drawer Header */}
            <div className="p-4 border-b border-border-default flex items-center justify-between bg-surface-3/50">
              <span className="text-xs font-bold font-display uppercase tracking-widest text-text-primary flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-accent-cyan" />
                Metadata Inspector
              </span>
              <button
                onClick={() => setSelectedEntry(null)}
                className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4.5">
              {/* Type Category */}
              <div>
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-text-muted">Category</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase", `badge-${selectedEntry.category}`)}>
                    {categoryLabels[selectedEntry.category]}
                  </span>
                </div>
                <p className="text-[10.5px] text-text-secondary font-sans leading-relaxed mt-2 p-2 bg-surface-3/40 rounded border border-border-subtle flex items-start gap-1.5">
                  <Info className="w-3 h-3 text-brand-indigo shrink-0 mt-0.5" />
                  {categoryDescriptions[selectedEntry.category]}
                </p>
              </div>

              {/* Timestamp */}
              <div>
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-text-muted">Logged Timestamp</span>
                <p className="text-xs text-text-primary font-mono mt-1 bg-surface-3/20 px-2 py-1 rounded">
                  {new Date(selectedEntry.timestamp).toLocaleString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZoneName: "short"
                  })}
                </p>
              </div>

              {/* Source Path */}
              <div>
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-text-muted text-ellipsis overflow-hidden">Source File</span>
                <p className="text-xs text-brand-indigo font-mono break-all mt-1 bg-surface-3/20 px-2 py-1 rounded border border-border-subtle">
                  {selectedEntry.sourceFile}
                </p>
              </div>

              {/* Entry UUID */}
              <div>
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-text-muted">Internal ID</span>
                <p className="text-[11px] text-text-secondary font-mono mt-1 select-all select-text selection:bg-brand-indigo/30 bg-surface-3/20 px-2 py-1 rounded">
                  {selectedEntry.id}
                </p>
              </div>

              {/* Complete content text */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-text-muted">Full content text</span>
                  <button
                    onClick={() => handleCopy(selectedEntry.id, selectedEntry.content)}
                    className="flex items-center gap-1 text-[9px] font-mono text-text-secondary hover:text-text-primary transition-all bg-surface-3 hover:bg-surface-4 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    {copiedId === selectedEntry.id ? (
                      <>
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="text-xs text-text-primary leading-relaxed p-3 bg-surface-3/30 border border-border-default rounded font-sans max-h-[160px] overflow-y-auto whitespace-pre-wrap select-text selection:bg-brand-indigo/30">
                  {selectedEntry.content}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-border-default bg-surface-3/20 text-center font-mono text-[9px] text-text-muted select-none">
              Memory Board Inspector v1.0
            </div>
          </div>
        </>
      )}
    </div>
  );
}
