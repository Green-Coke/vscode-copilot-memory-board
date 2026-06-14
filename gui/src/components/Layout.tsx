// ============================================================================
// Layout — Responsive Adaptive Layout Container
// ============================================================================
// Provides three layout modes with glassmorphism styles:
// - Wide (≥900px): Three columns — Repos | Sessions | Memory Entries
// - Medium (500–899px): Two columns — List | Detail
// - Narrow (<500px / sidebar): Single column with breadcrumb navigation
// ============================================================================

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { getBridgeEnvironment, readScanTarget, writeScanTarget, type ScanTarget } from "@/lib/bridge";
import {
  ChevronLeft, FolderGit2, MessageSquare, Terminal,
  ChevronDown, PanelLeftClose, PanelLeftOpen
} from "lucide-react";

/**
 * 当前运行环境是否为 VS Code 插件模式。
 * bridge.ts 在模块加载阶段即完成探测，因此这里可直接同步读取。
 */
const isVscode = getBridgeEnvironment() === "vscode";

// ---------------------------------------------------------------------------
// NarrowHeader for narrow mode (Single column)
// ---------------------------------------------------------------------------

interface NarrowHeaderProps {
  currentView: ViewMode;
  selectedWorkspace: any;
  selectedSession: any;
  onBackToWorkspaces?: () => void;
  onBackToSessions?: () => void;
  /** 当前是否正处于工作区级目录视图 */
  viewingWorkspaceFiles?: boolean;
}

/**
 * 窄屏单栏模式下专用的顶部导航返回条。
 * 解决了面包屑路径过长、容易发生换行或重叠的问题。
 * - Sessions 视图下显示：[<-] 工作区名
 * - Entries 视图下显示：[<-] 会话标题
 */
function NarrowHeader({
  currentView,
  selectedWorkspace,
  selectedSession,
  onBackToWorkspaces,
  onBackToSessions,
  viewingWorkspaceFiles = false,
}: NarrowHeaderProps) {
  if (currentView === "workspaces") return null;

  const handleBack = currentView === "entries" ? onBackToSessions : onBackToWorkspaces;
  const title = currentView === "entries"
    ? (viewingWorkspaceFiles ? `${selectedWorkspace?.name} / 工作区级目录` : selectedSession?.title)
    : selectedWorkspace?.name;

  return (
    <nav className="flex items-center gap-2 px-3 py-2 border-b border-border-default bg-surface-1/80 backdrop-blur-md z-20 relative min-h-[40px] shrink-0">
      <button
        onClick={handleBack}
        className="p-1 rounded hover:bg-surface-3 transition-colors text-text-secondary hover:text-brand-indigo cursor-pointer flex items-center justify-center shrink-0"
        title="返回上一级"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <span className="text-xs font-bold text-text-primary truncate font-display">
        {title}
      </span>
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
  /**
   * 标题图标左侧的引导操作位（leading action）。
   * VS Code 模式下，仓库折叠按钮挂在这里，避免浮层与标题图标/文字重叠。
   */
  leadingAction?: ReactNode;
  /**
   * 窄屏单栏模式下，是否隐藏该 Panel 的自带头部标题栏（避免与外部窄屏顶部返回头冲突）
   */
  hideHeaderInNarrow?: boolean;
}

/**
 * 面板容器组件：统一管理标题栏（含引导操作位与尾部操作位）与可滚动内容区。
 * leadingAction 渲染在图标之前，避免与标题文字/图标在左上角发生视觉重叠。
 */
export function Panel({
  title,
  icon,
  children,
  className,
  action,
  leadingAction,
  hideHeaderInNarrow = false,
}: PanelProps) {
  // 这是一个面板容器组件，主要负责统一管理标题栏和可滚动内容区。
  // 若标题是 "工作区" 且传入了折叠按钮 leadingAction，则只显示折叠按钮，隐藏图标和标题以防左上角发生重叠。
  const shouldHideTitleAndIcon = title === "工作区" && leadingAction;

  return (
    <div className={cn("flex flex-col h-full min-h-0 relative z-10", className)}>
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-2/30 backdrop-blur-md",
          hideHeaderInNarrow && "min-[500px]:flex hidden"
        )}
      >
        <div className="flex items-center gap-2">
          {/* 渲染引导操作位，如侧栏展开折叠按钮 */}
          {leadingAction}
          {!shouldHideTitleAndIcon && (
            <>
              <div className="text-text-secondary flex items-center justify-center">
                {icon}
              </div>
              <h2 className="text-[11px] font-bold tracking-widest text-text-secondary font-display uppercase">
                {title}
              </h2>
            </>
          )}
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

/**
 * 工作区选择与状态数据接口定义
 */
interface AppHeaderProps {
  stats?: {
    workspaces: number;
    sessions: number;
    entries: number;
  };
  workspaces?: any[];
  selectedWorkspace?: any;
  onSelectWorkspace?: (workspace: any) => void;
}

/**
 * 应用程序顶部 Header 组件
 * 包含品牌 Logo、当前工作区切换下拉菜单、工作区栏展开折叠按钮以及数据统计
 */
export function AppHeader({
  stats,
  workspaces,
  selectedWorkspace,
  onSelectWorkspace
}: AppHeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  // Standalone 扫描目标：Stable / Insiders。仅 standalone 模式渲染（VS Code 模式直接走真实 storageUri）
  const [scanTarget, setScanTarget] = useState<ScanTarget>(() => readScanTarget());

  /**
   * 切换 Stable / Insiders：写入 localStorage 后强制 reload。
   * 触发 reload 是为了让所有 hooks（useWorkspaces / useSessions / useMemoryContent）重新走 fetch，
   * 让用户立刻看到切换效果，而不是手动点击刷新。
   */
  const handleToggleScanTarget = () => {
    const next: ScanTarget = scanTarget === "stable" ? "insiders" : "stable";
    writeScanTarget(next);
    setScanTarget(next);
    // 给用户一个机会看到提示，再 reload
    setTimeout(() => window.location.reload(), 50);
  };

  return (
    <header className="relative flex items-center justify-between px-5 py-4 border-b border-border-default bg-surface-1/90 backdrop-blur-md z-30">
      {/* Glow highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-brand-indigo/60 to-transparent" />

      <div className="flex items-center gap-3">
        {/* Glowing Neural Network SVG Logo */}
        <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2 border border-border-default shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)] shrink-0">
          <svg viewBox="0 0 100 100" className="w-6 h-6 text-brand-indigo animate-brain-glow" fill="none" stroke="currentColor" strokeWidth="1.5">
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
          <h1 className="text-base font-extrabold tracking-tight text-text-primary font-display flex items-center gap-1.5 leading-none">
            Memory Board
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo leading-none font-semibold">
              v1.0.0
            </span>
          </h1>
        </div>
      </div>

      {/* Connection Indicator & Optional Stats */}
      <div className="flex items-center gap-4">
        {/* Workspace Switcher / 顶部工作区快速切换器 */}
        {workspaces && workspaces.length > 0 && (
          <div className="relative font-sans text-xs">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-surface-2 border border-border-default hover:border-brand-indigo transition-colors cursor-pointer text-text-primary font-medium"
            >
              <FolderGit2 className="w-4 h-4 text-brand-indigo" />
              <span className="max-w-[220px] truncate">{selectedWorkspace ? selectedWorkspace.name : "选择工作区…"}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 text-text-muted transition-transform duration-200", isDropdownOpen && "rotate-180")} />
            </button>

            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-80 max-h-80 overflow-y-auto rounded-lg border border-border-default bg-surface-2 shadow-xl z-50 p-1 flex flex-col gap-1 backdrop-blur-md">
                  <div className="px-2 py-1.5 text-[10px] font-bold tracking-widest text-text-muted font-display uppercase border-b border-border-subtle mb-1">
                    切换工作区
                  </div>
                  {workspaces.map((workspace) => {
                    const isSelected = selectedWorkspace?.id === workspace.id;
                    return (
                      <button
                        key={workspace.id}
                        onClick={() => {
                          onSelectWorkspace?.(workspace);
                          setIsDropdownOpen(false);
                        }}
                        className={cn(
                          "flex flex-col px-2.5 py-2 rounded text-left cursor-pointer transition-colors w-full",
                          isSelected
                            ? "bg-selected-bg text-selected-text border border-selected-border"
                            : "hover:bg-surface-3/60 text-text-primary border border-transparent"
                        )}
                      >
                        <span className="font-bold text-xs truncate w-full">{workspace.name}</span>
                        <span className="text-[9px] text-text-secondary truncate w-full font-mono mt-0.5">{workspace.path}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {stats && (
          <div
            data-testid="header-stats"
            className="hidden sm:flex items-center gap-4 font-mono text-sm text-text-secondary border-r border-border-default pr-5"
          >
            <span className="flex items-center gap-1.5">
              <FolderGit2 className="w-4 h-4 text-text-muted" />
              <span className="font-bold text-text-primary">{stats.workspaces}</span>{" "}
              <span className="text-text-muted">workspaces</span>
            </span>
          </div>
        )}

        {/* Standalone 扫描目标切换：Stable ↔ ↻ Insiders；仅 standalone 模式渲染 */}
        <button
          data-testid="scan-target-toggle"
          type="button"
          onClick={handleToggleScanTarget}
          title={scanTarget === "stable"
            ? "当前扫描 VS Code 正式版 (Code)；点击切换到 Insiders"
            : "当前扫描 VS Code Insiders；点击切换到正式版 (Code)"}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-2 border border-border-default hover:border-brand-indigo transition-colors cursor-pointer text-text-primary font-mono text-[11px]"
        >
          <Terminal className="w-3.5 h-3.5 text-brand-indigo" />
          <span>{scanTarget === "stable" ? "Stable" : "Insiders"}</span>
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Layout modes
// ---------------------------------------------------------------------------

export type ViewMode = "workspaces" | "sessions" | "entries";

/**
 * 响应式布局容器 Props 接口
 */
interface LayoutProps {
  repoPanel: ReactNode;
  sessionPanel: ReactNode;
  entryPanel: ReactNode;
  currentView: ViewMode;
  stats?: AppHeaderProps["stats"];
  repoPanelCollapsed?: boolean;
  /** 工作区列表数据（Adapter: 保留 repo 命名以兼容 App.tsx 调用方） */
  repos?: any[];
  /** 当前选中的工作区（Adapter: 保留 repo 命名以兼容 App.tsx 调用方） */
  selectedRepo?: any;
  /** 选中工作区回调（Adapter: 保留 repo 命名以兼容 App.tsx 调用方） */
  onSelectRepo?: (repo: any) => void;
  /** 返回工作区列表的回调（Adapter: 保留 repo 命名以兼容 App.tsx 调用方） */
  onBackToRepos?: () => void;
  /** 返回会话列表的回调 */
  onBackToSessions?: () => void;
  /** 当前选中的会话信息 */
  selectedSession?: any;
  /** 当前是否为工作区级目录视图（Adapter: 保留 repo 命名以兼容 App.tsx 调用方） */
  viewingRepoFiles?: boolean;
}

/**
 * 工作区栏折叠按钮：VS Code 插件模式下没有 AppHeader，
 * 这个紧凑按钮提供展开/折叠入口，挂在 Panel 标题栏图标左侧。
 *
   * disabled=true（未选择工作区）时按钮置灰且不可点击，但仍保持可见，
   * 明确传达“当前不可折叠”的状态；由 App.tsx 通过 Panel 的 leadingAction 注入。
   */
export function WorkspaceCollapseButton({
  collapsed,
  onToggle,
  disabled = false,
}: {
  collapsed: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      aria-disabled={disabled}
      title={
        disabled
          ? "未选择工作区时不可折叠"
          : collapsed
            ? "展开工作区栏"
            : "折叠工作区栏"
      }
      className={cn(
        "p-1.5 rounded transition-colors flex items-center justify-center shrink-0 min-[900px]:flex hidden",
        disabled
          ? "opacity-40 cursor-not-allowed text-text-muted"
          : "hover:bg-surface-3 cursor-pointer text-text-secondary hover:text-brand-indigo"
      )}
    >
      {collapsed ? (
        <PanelLeftOpen className="w-4 h-4" />
      ) : (
        <PanelLeftClose className="w-4 h-4" />
      )}
    </button>
  );
}

/**
 * 自适应响应式三栏/双栏/单栏布局组件
 * 支持仓库栏折叠并整合顶部 Header。
 * - standalone 模式：保留完整品牌 AppHeader。
 * - VS Code 插件模式：不渲染 AppHeader，仓库栏切换按钮迁移到下方分区上沿。
 */
export function AdaptiveLayout({
  repoPanel,
  sessionPanel,
  entryPanel,
  currentView,
  stats,
  repoPanelCollapsed = false,
  repos,
  selectedRepo,
  onSelectRepo,
  onBackToRepos,
  onBackToSessions,
  selectedSession,
  viewingRepoFiles,
}: LayoutProps) {
  return (
    <div className="flex flex-col h-full relative overflow-hidden select-none bg-surface-0">
      {/* Matrix Mesh Backdrops */}
      <div className="cyber-bg" />
      <div className="cyber-grid" />

      {/* Main Top Header —— 仅 standalone 模式渲染完整品牌头部；VS Code 模式去掉整条顶栏。
          VS Code 模式下，仓库栏折叠按钮由 App.tsx 通过各 Panel 的 leadingAction 注入，
          因此本组件不再在 layout 中渲染任何 absolute 浮层。 */}
      {!isVscode && (
        <AppHeader
          stats={stats}
          workspaces={repos as any}
          selectedWorkspace={selectedRepo as any}
          onSelectWorkspace={onSelectRepo as any}
        />
      )}

      {/* 宽屏布局（≥900px）：三栏比例自适应布局，带有最小/最大宽度限制 */}
      <div className="hidden min-[900px]:flex flex-1 min-h-0 z-10 relative">
        {!repoPanelCollapsed && (
          <div className="w-[22%] min-w-[260px] max-w-[520px] shrink-0 border-r border-border-default/80 bg-surface-1/40 backdrop-blur-sm">
            {repoPanel}
          </div>
        )}
        {/* Sessions 会话栏：在折叠时加宽占约 28%，最小 280px，最大 560px / 520px。
            仓库折叠后，折叠按钮随 leadingAction 挂会在这里的 Panel 标题栏图标左侧。 */}
        <div className={cn(
          "shrink-0 border-r border-border-default/80 bg-surface-1/30 backdrop-blur-sm",
          repoPanelCollapsed ? "w-[28%] min-w-[280px] max-w-[560px]" : "w-[26%] min-w-[280px] max-w-[520px]"
        )}>
          {sessionPanel}
        </div>
        {/* Memory Entries 内存条目栏：填充剩余所有宽度 */}
        <div className="flex-1 min-w-0 bg-surface-1/10">
          {entryPanel}
        </div>
      </div>

      {/* 中等屏幕布局（500–899px）：双栏“列表 / 详情”导航。
          中屏左列规则：
          - workspaces 视图：工作区列表（标题栏内可渲染折叠按钮）
          - sessions 视图：会话列表
          - entries 视图：会话列表（主列为条目/详情，保持上下文） */}
      <div className="hidden min-[500px]:flex min-[900px]:hidden flex-1 min-h-0 z-10 relative">
        <div className="w-[40%] min-w-[220px] max-w-[420px] shrink-0 border-r border-border-default/80 bg-surface-1/40 backdrop-blur-sm relative">
          {currentView === "workspaces" ? repoPanel : sessionPanel}
        </div>
        {/* 右侧主视口栏：填充剩余宽度 */}
        <div className="flex-1 min-w-0 bg-surface-1/20">
          {currentView === "entries" ? entryPanel : (
            currentView === "workspaces" ? entryPanel : sessionPanel
          )}
        </div>
      </div>

      {/* Narrow layout: Single column (<500px / sidebar) */}
      <div className="flex min-[500px]:hidden flex-col flex-1 min-h-0 z-10 relative">
        <NarrowHeader
          currentView={currentView}
          selectedWorkspace={selectedRepo as any}
          selectedSession={selectedSession}
          onBackToWorkspaces={onBackToRepos as any}
          onBackToSessions={onBackToSessions}
          viewingWorkspaceFiles={viewingRepoFiles as any}
        />
        <div className="flex-1 overflow-y-auto min-h-0 bg-surface-1/30">
          {currentView === "workspaces" && repoPanel}
          {currentView === "sessions" && sessionPanel}
          {currentView === "entries" && entryPanel}
        </div>
      </div>
    </div>
  );
}
