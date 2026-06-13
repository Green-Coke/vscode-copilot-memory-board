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
import { getBridgeEnvironment } from "@/lib/bridge";
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

/**
 * 仓库选择与状态数据接口定义
 */
interface AppHeaderProps {
  stats?: {
    repos: number;
    sessions: number;
    entries: number;
  };
  repoPanelCollapsed?: boolean;
  setRepoPanelCollapsed?: (collapsed: boolean) => void;
  repos?: any[];
  selectedRepo?: any;
  onSelectRepo?: (repo: any) => void;
}

/**
 * 应用程序顶部 Header 组件
 * 包含品牌 Logo、当前仓库切换下拉菜单、仓库栏展开折叠按钮以及数据统计
 */
export function AppHeader({ 
  stats, 
  repoPanelCollapsed, 
  setRepoPanelCollapsed, 
  repos, 
  selectedRepo, 
  onSelectRepo 
}: AppHeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <header className="relative flex items-center justify-between px-5 py-4 border-b border-border-default bg-surface-1/90 backdrop-blur-md z-30">
      {/* Glow highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-brand-indigo/60 to-transparent" />
      
      <div className="flex items-center gap-3">
        {/* Toggle Button / 侧边仓库栏折叠展开按钮 */}
        {setRepoPanelCollapsed !== undefined && (
          <button
            onClick={() => setRepoPanelCollapsed(!repoPanelCollapsed)}
            className="p-1.5 rounded hover:bg-surface-3 transition-colors cursor-pointer text-text-secondary hover:text-brand-indigo flex items-center justify-center shrink-0"
            title={repoPanelCollapsed ? "展开仓库栏" : "折叠仓库栏"}
          >
            {repoPanelCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}

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
          <p className="text-[11px] text-text-secondary font-mono tracking-wide mt-1 uppercase flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-accent-cyan inline" />
            GitHub Copilot Memory Indexer
          </p>
        </div>
      </div>

      {/* Connection Indicator & Optional Stats */}
      <div className="flex items-center gap-4">
        {/* Repo Switcher / 顶部仓库快速切换器 */}
        {repos && repos.length > 0 && (
          <div className="relative font-sans text-xs">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-surface-2 border border-border-default hover:border-brand-indigo transition-colors cursor-pointer text-text-primary font-medium"
            >
              <FolderGit2 className="w-4 h-4 text-brand-indigo" />
              <span className="max-w-[220px] truncate">{selectedRepo ? selectedRepo.name : "选择仓库..."}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 text-text-muted transition-transform duration-200", isDropdownOpen && "rotate-180")} />
            </button>
            
            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-80 max-h-80 overflow-y-auto rounded-lg border border-border-default bg-surface-2 shadow-xl z-50 p-1 flex flex-col gap-1 backdrop-blur-md">
                  <div className="px-2 py-1.5 text-[10px] font-bold tracking-widest text-text-muted font-display uppercase border-b border-border-subtle mb-1">
                    切换仓库
                  </div>
                  {repos.map((repo) => {
                    const isSelected = selectedRepo?.id === repo.id;
                    return (
                      <button
                        key={repo.id}
                        onClick={() => {
                          onSelectRepo?.(repo);
                          setIsDropdownOpen(false);
                        }}
                        className={cn(
                          "flex flex-col px-2.5 py-2 rounded text-left cursor-pointer transition-colors w-full",
                          isSelected
                            ? "bg-selected-bg text-selected-text border border-selected-border"
                            : "hover:bg-surface-3/60 text-text-primary border border-transparent"
                        )}
                      >
                        <span className="font-bold text-xs truncate w-full">{repo.name}</span>
                        <span className="text-[9px] text-text-secondary truncate w-full font-mono mt-0.5">{repo.path}</span>
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
              <span className="font-bold text-text-primary">{stats.repos}</span>{" "}
              <span className="text-text-muted">repos</span>
            </span>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-text-muted" />
              <span className="font-bold text-text-primary">{stats.sessions}</span>{" "}
              <span className="text-text-muted">sessions</span>
            </span>
          </div>
        )}
        <div
          data-testid="header-connected"
          className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-surface-2 border border-border-default shrink-0"
          title="已连接"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
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

/**
 * 响应式布局容器 Props 接口
 */
interface LayoutProps {
  repoPanel: ReactNode;
  sessionPanel: ReactNode;
  entryPanel: ReactNode;
  breadcrumbItems?: BreadcrumbProps["items"];
  currentView: ViewMode;
  stats?: AppHeaderProps["stats"];
  repoPanelCollapsed?: boolean;
  setRepoPanelCollapsed?: (collapsed: boolean) => void;
  /**
   * 统一的仓库栏切换处理器：在宽屏、中屏、窄屏下都负责显隐仓库面板，
   * 调用方需自行处理状态编排（例如从 entries 回到 repos 视图）。
   */
  onToggleRepoBar?: () => void;
  repos?: any[];
  selectedRepo?: any;
  onSelectRepo?: (repo: any) => void;
}

/**
 * 仓库栏切换按钮：在 VS Code 插件模式下没有 AppHeader，
 * 由这个紧凑按钮提供恢复入口，放在当前可见列的固定上沿。
 */
function RepoBarToggleButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "p-1.5 rounded hover:bg-surface-3 transition-colors cursor-pointer",
        "text-text-secondary hover:text-brand-indigo flex items-center justify-center shrink-0"
      )}
      title={collapsed ? "展开仓库栏" : "折叠仓库栏"}
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
  breadcrumbItems,
  currentView,
  stats,
  repoPanelCollapsed = false,
  setRepoPanelCollapsed,
  onToggleRepoBar,
  repos,
  selectedRepo,
  onSelectRepo,
}: LayoutProps) {
  /**
   * 统一的折叠切换入口：
   * - 提供了 onToggleRepoBar 时，状态编排交给上层（App）。
   * - 否则回退到只切 setRepoPanelCollapsed，保持向后兼容。
   */
  const handleToggle = () => {
    if (onToggleRepoBar) {
      onToggleRepoBar();
    } else {
      setRepoPanelCollapsed?.(!repoPanelCollapsed);
    }
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden select-none bg-surface-0">
      {/* Matrix Mesh Backdrops */}
      <div className="cyber-bg" />
      <div className="cyber-grid" />

      {/* Main Top Header —— 仅 standalone 模式渲染完整品牌头部；VS Code 模式去掉整条顶栏 */}
      {!isVscode && (
        <AppHeader
          stats={stats}
          repoPanelCollapsed={repoPanelCollapsed}
          setRepoPanelCollapsed={setRepoPanelCollapsed}
          repos={repos}
          selectedRepo={selectedRepo}
          onSelectRepo={onSelectRepo}
        />
      )}

      {/* 宽屏布局（≥900px）：三栏比例自适应布局，带有最小/最大宽度限制 */}
      <div className="hidden min-[900px]:flex flex-1 min-h-0 z-10 relative">
        {/* VS Code 模式下：在当前可见区间上沿放仓库栏切换按钮 */}
        {isVscode && (
          <div className="absolute top-2 left-2 z-20">
            <RepoBarToggleButton
              collapsed={repoPanelCollapsed}
              onToggle={handleToggle}
            />
          </div>
        )}
        {/* Repositories 仓库栏：占宽约 22%，最小 260px，最大 520px */}
        {!repoPanelCollapsed && (
          <div className="w-[22%] min-w-[260px] max-w-[520px] shrink-0 border-r border-border-default/80 bg-surface-1/40 backdrop-blur-sm">
            {repoPanel}
          </div>
        )}
        {/* Sessions 会话栏：在折叠时加宽占约 28%，最小 280px，最大 560px / 520px */}
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
          修复：不再把左列写死成 `currentView !== repos => sessionPanel`，
          选仓库后再点仓库栏按钮可切回 repos 列表，复制会话列表的 bug 不再出现。
          中屏左列规则：
          - repos 视图：仓库列表
          - sessions 视图：会话列表
          - entries 视图：会话列表（主列为条目/详情，保持上下文） */}
      <div className="hidden min-[500px]:flex min-[900px]:hidden flex-1 min-h-0 z-10 relative">
        <div className="w-[40%] min-w-[220px] max-w-[420px] shrink-0 border-r border-border-default/80 bg-surface-1/40 backdrop-blur-sm relative">
          {/* 中屏左列上沿也放仓库栏切换按钮（VS Code 模式下尤其重要，因为没有顶栏） */}
          {isVscode && (
            <div className="absolute top-2 left-2 z-20">
              <RepoBarToggleButton
                collapsed={repoPanelCollapsed}
                onToggle={handleToggle}
              />
            </div>
          )}
          {currentView === "repos" ? repoPanel : sessionPanel}
        </div>
        {/* 右侧主视口栏：填充剩余宽度 */}
        <div className="flex-1 min-w-0 bg-surface-1/20">
          {currentView === "entries" ? entryPanel : (
            currentView === "repos" ? entryPanel : sessionPanel
          )}
        </div>
      </div>

      {/* Narrow layout: Single column (<500px / sidebar) */}
      <div className="flex min-[500px]:hidden flex-col flex-1 min-h-0 z-10 relative">
        {/* VS Code 模式下：窄屏单列也提供按钮，保证不会失去恢复入口 */}
        {isVscode && (
          <div className="flex items-center justify-start px-2 py-2 border-b border-border-default/80 bg-surface-1/40 backdrop-blur-sm">
            <RepoBarToggleButton
              collapsed={repoPanelCollapsed}
              onToggle={handleToggle}
            />
          </div>
        )}
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
