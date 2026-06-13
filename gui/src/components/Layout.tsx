// ============================================================================
// Layout — Responsive Adaptive Layout Container
// ============================================================================
// Provides three layout modes with glassmorphism styles:
// - Wide (≥900px): Three columns — Repos | Sessions | Memory Entries
// - Medium (500–899px): Two columns — List | Detail
// - Narrow (<500px / sidebar): Single column with breadcrumb navigation
// ============================================================================

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, FolderGit2, MessageSquare, Terminal } from "lucide-react";

// ---------------------------------------------------------------------------
// Navigation breadcrumb for narrow mode
// ---------------------------------------------------------------------------

interface BreadcrumbProps {
  items: { label: string; onClick?: () => void }[];
}

function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border-default bg-surface-1/80 backdrop-blur-md z-20 relative">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1.5 font-mono text-[11px]">
          {index > 0 && (
            <span className="text-text-muted">/</span>
          )}
          {item.onClick ? (
            <button
              onClick={item.onClick}
              className="text-brand-indigo hover:text-accent-cyan hover:underline transition-all flex items-center gap-1 cursor-pointer"
            >
              {index === 0 && items.length > 1 && (
                <ChevronLeft className="w-3 h-3" />
              )}
              {item.label}
            </button>
          ) : (
            <span className="text-text-secondary font-medium truncate max-w-[150px]">
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
  action?: ReactNode;
}

export function Panel({ title, icon, children, className, action }: PanelProps) {
  return (
    <div className={cn("flex flex-col h-full min-h-0 relative z-10", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-2/30 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="text-text-secondary flex items-center justify-center">
            {icon}
          </div>
          <h2 className="text-[11px] font-bold tracking-widest text-text-secondary font-display uppercase">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 relative bg-surface-2/10">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App header
// ---------------------------------------------------------------------------

interface AppHeaderProps {
  stats?: {
    repos: number;
    sessions: number;
    entries: number;
  };
}

export function AppHeader({ stats }: AppHeaderProps) {
  return (
    <header className="relative flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-1/90 backdrop-blur-md z-30">
      {/* Glow highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-brand-indigo/60 to-transparent" />
      
      <div className="flex items-center gap-3">
        {/* Glowing Neural Network SVG Logo */}
        <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-surface-2 border border-border-default shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]">
          <svg viewBox="0 0 100 100" className="w-5 h-5 text-brand-indigo animate-brain-glow" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M50 20 C32 20, 24 35, 24 50 C24 65, 32 80, 50 80 C68 80, 76 65, 76 50 C76 35, 68 20, 50 20 Z" />
            <path d="M50 20 L50 80" />
            <path d="M36 30 C42 36, 42 44, 36 50 C30 56, 30 64, 36 70" />
            <path d="M64 30 C58 36, 58 44, 64 50 C70 56, 70 64, 64 70" />
            <circle cx="50" cy="20" r="3" fill="currentColor" className="text-accent-cyan" />
            <circle cx="50" cy="50" r="3" fill="currentColor" className="text-brand-purple" />
            <circle cx="50" cy="80" r="3" fill="currentColor" className="text-accent-pink" />
            <circle cx="36" cy="30" r="2" fill="currentColor" />
            <circle cx="24" cy="50" r="2" fill="currentColor" />
            <circle cx="36" cy="70" r="2" fill="currentColor" />
            <circle cx="64" cy="30" r="2" fill="currentColor" />
            <circle cx="76" cy="50" r="2" fill="currentColor" />
            <circle cx="64" cy="70" r="2" fill="currentColor" />
          </svg>
          {/* Subtle logo pulse rings */}
          <span className="absolute -inset-0.5 rounded-lg border border-brand-indigo/20 animate-pulse" />
        </div>
        <div>
          <h1 className="text-sm font-extrabold tracking-tight text-text-primary font-display flex items-center gap-1.5">
            Memory Board
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo leading-none font-semibold">
              v1.0.0
            </span>
          </h1>
          <p className="text-[10px] text-text-secondary font-mono tracking-wide mt-0.5 uppercase flex items-center gap-1">
            <Terminal className="w-3 h-3 text-accent-cyan inline" />
            GitHub Copilot Memory Indexer
          </p>
        </div>
      </div>

      {/* Connection Indicator & Optional Stats */}
      <div className="flex items-center gap-4">
        {stats && (
          <div className="hidden sm:flex items-center gap-3 font-mono text-[10px] text-text-secondary border-r border-border-default pr-4">
            <span className="flex items-center gap-1">
              <FolderGit2 className="w-3 h-3 text-text-muted" />
              {stats.repos} <span className="text-text-muted">repos</span>
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3 text-text-muted" />
              {stats.sessions} <span className="text-text-muted">sessions</span>
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-2 border border-border-default">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[9px] font-mono font-bold tracking-wider text-emerald-400 uppercase">
            Connected
          </span>
        </div>
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
  stats?: AppHeaderProps["stats"];
}

export function AdaptiveLayout({
  repoPanel,
  sessionPanel,
  entryPanel,
  breadcrumbItems,
  currentView,
  stats,
}: LayoutProps) {
  return (
    <div className="flex flex-col h-full relative overflow-hidden select-none bg-surface-0">
      {/* Matrix Mesh Backdrops */}
      <div className="cyber-bg" />
      <div className="cyber-grid" />

      {/* Main Top Header */}
      <AppHeader stats={stats} />

      {/* Wide layout: Three columns (≥900px) */}
      <div className="hidden min-[900px]:flex flex-1 min-h-0 z-10 relative">
        <div className="w-[280px] shrink-0 border-r border-border-default/80 bg-surface-1/40 backdrop-blur-sm">
          {repoPanel}
        </div>
        <div className="w-[290px] shrink-0 border-r border-border-default/80 bg-surface-1/30 backdrop-blur-sm">
          {sessionPanel}
        </div>
        <div className="flex-1 min-w-0 bg-surface-1/10">
          {entryPanel}
        </div>
      </div>

      {/* Medium layout: Two columns (500–899px) */}
      <div className="hidden min-[500px]:flex min-[900px]:hidden flex-1 min-h-0 z-10 relative">
        <div className="w-[260px] shrink-0 border-r border-border-default/80 bg-surface-1/40 backdrop-blur-sm">
          {currentView === "repos" ? repoPanel : sessionPanel}
        </div>
        <div className="flex-1 min-w-0 bg-surface-1/20">
          {currentView === "entries" ? entryPanel : sessionPanel}
        </div>
      </div>

      {/* Narrow layout: Single column (<500px / sidebar) */}
      <div className="flex min-[500px]:hidden flex-col flex-1 min-h-0 z-10 relative">
        {breadcrumbItems && breadcrumbItems.length > 1 && (
          <Breadcrumb items={breadcrumbItems} />
        )}
        <div className="flex-1 overflow-y-auto min-h-0 bg-surface-1/30">
          {currentView === "repos" && repoPanel}
          {currentView === "sessions" && sessionPanel}
          {currentView === "entries" && entryPanel}
        </div>
      </div>
    </div>
  );
}
