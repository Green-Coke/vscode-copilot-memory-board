// ============================================================================
// Layout — Responsive Adaptive Layout Container
// ============================================================================
// Provides three layout modes:
// - Wide (≥900px): Three columns — Repos | Sessions | Memory Entries
// - Medium (500–899px): Two columns — List | Detail
// - Narrow (<500px / sidebar): Single column with breadcrumb navigation
// ============================================================================

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, Brain } from "lucide-react";

// ---------------------------------------------------------------------------
// Navigation breadcrumb for narrow mode
// ---------------------------------------------------------------------------

interface BreadcrumbProps {
  items: { label: string; onClick?: () => void }[];
}

function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 px-3 py-2 border-b border-border-default bg-surface-1">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && (
            <span className="text-text-muted text-xs">/</span>
          )}
          {item.onClick ? (
            <button
              onClick={item.onClick}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-0.5"
            >
              {index === 0 && items.length > 1 && (
                <ChevronLeft className="w-3 h-3" />
              )}
              {item.label}
            </button>
          ) : (
            <span className="text-xs text-text-secondary font-medium truncate max-w-[120px]">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Panel header
// ---------------------------------------------------------------------------

interface PanelProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, icon, children, className }: PanelProps) {
  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-default bg-surface-1/50">
        {icon}
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {title}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App header
// ---------------------------------------------------------------------------

export function AppHeader() {
  return (
    <header className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border-default bg-surface-1">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-500/20">
        <Brain className="w-4 h-4 text-white" />
      </div>
      <div>
        <h1 className="text-sm font-bold text-text-primary leading-none">
          Memory Board
        </h1>
        <p className="text-[10px] text-text-muted mt-0.5">
          Copilot Long-Term Memory
        </p>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Layout modes
// ---------------------------------------------------------------------------

export type ViewMode = "repos" | "sessions" | "entries";

interface LayoutProps {
  repoPanel: ReactNode;
  sessionPanel: ReactNode;
  entryPanel: ReactNode;
  breadcrumbItems?: BreadcrumbProps["items"];
  currentView: ViewMode;
}

export function AdaptiveLayout({
  repoPanel,
  sessionPanel,
  entryPanel,
  breadcrumbItems,
  currentView,
}: LayoutProps) {
  return (
    <div className="flex flex-col h-full">
      <AppHeader />

      {/* Wide layout: Three columns (≥900px) */}
      <div className="hidden min-[900px]:flex flex-1 min-h-0">
        <div className="w-[260px] shrink-0 border-r border-border-default">
          {repoPanel}
        </div>
        <div className="w-[260px] shrink-0 border-r border-border-default">
          {sessionPanel}
        </div>
        <div className="flex-1 min-w-0">{entryPanel}</div>
      </div>

      {/* Medium layout: Two columns (500–899px) */}
      <div className="hidden min-[500px]:flex min-[900px]:hidden flex-1 min-h-0">
        <div className="w-[240px] shrink-0 border-r border-border-default">
          {currentView === "repos" ? repoPanel : sessionPanel}
        </div>
        <div className="flex-1 min-w-0">
          {currentView === "entries" ? entryPanel : sessionPanel}
        </div>
      </div>

      {/* Narrow layout: Single column (<500px / sidebar) */}
      <div className="flex min-[500px]:hidden flex-col flex-1 min-h-0">
        {breadcrumbItems && breadcrumbItems.length > 1 && (
          <Breadcrumb items={breadcrumbItems} />
        )}
        <div className="flex-1 overflow-y-auto min-h-0">
          {currentView === "repos" && repoPanel}
          {currentView === "sessions" && sessionPanel}
          {currentView === "entries" && entryPanel}
        </div>
      </div>
    </div>
  );
}
