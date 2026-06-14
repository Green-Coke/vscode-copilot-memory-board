// ============================================================================
// App — Main Application Component
// ============================================================================
// Wires together the bridge, hooks, and layout components to form the
// complete Memory Board UI. Manages navigation state for adaptive layout.
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import type { Repository, Session } from "@memory-board/core";
import { initBridge } from "@/lib/bridge";
import {
  useRepos,
  useSessions,
  useMemoryContent,
  useUiPreferences,
  useWorkspaceState,
} from "@/hooks/use-bridge";
import { AdaptiveLayout, Panel, RepoCollapseButton, type ViewMode } from "@/components/Layout";
import { RepoList } from "@/components/RepoList";
import { SessionList } from "@/components/SessionList";
import { MemoryViewer } from "@/components/MemoryViewer";
import { FolderGit2, MessageSquare, FileText } from "lucide-react";

export function App() {
  // Initialize bridge on mount
  useEffect(() => {
    const env = initBridge();
    console.log(`[App] Memory Board initialized in ${env} mode`);
  }, []);

  // ---------------------------------------------------------------------------
  // Navigation State
  // ---------------------------------------------------------------------------

  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>("repos");
  const [repoPanelCollapsed, setRepoPanelCollapsed] = useState(false);
  // 标记右侧当前是否展示 "仓库级目录" 视图；选中某个 session 时会被清空
  const [viewingRepoFiles, setViewingRepoFiles] = useState(false);

  // ---------------------------------------------------------------------------
  // UI 偏好与工作区状态（来自持久层）
  // - uiPreferences.enableFilePreview：全局偏好，控制文件预览能力总开关
  // - workspaceState：按工作区维度保存排序、预览面板展开状态与钉选集合
  // ---------------------------------------------------------------------------
  const { preferences, update: updateUiPreferences } = useUiPreferences();
  const { state: workspaceState, update: updateWorkspaceState } =
    useWorkspaceState();

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const { data: repos, loading: reposLoading } = useRepos();
  const { data: sessions, loading: sessionsLoading } = useSessions(
    selectedRepo?.id ?? null
  );
  const { data: entries, loading: entriesLoading } = useMemoryContent(
    selectedSession?.id ?? null
  );

  // ---------------------------------------------------------------------------
  // Navigation Handlers
  // ---------------------------------------------------------------------------

  const handleSelectRepo = useCallback((repo: Repository) => {
    setSelectedRepo(repo);
    setSelectedSession(null);
    setViewingRepoFiles(false);
    setCurrentView("sessions");
    // 桌面宽屏下不再自动折叠仓库栏，保持仓库 / 会话 / 条目三栏始终可见；
    // 仅窄屏经由 currentView 切页，repoPanelCollapsed 仍可由顶部按钮手动控制
  }, []);

  const handleSelectSession = useCallback((session: Session) => {
    setSelectedSession(session);
    // 选中具体会话后退出仓库级目录视图
    setViewingRepoFiles(false);
    setCurrentView("entries");
  }, []);

  /**
   * 未选中仓库时禁止折叠仓库栏：保留选中仓库才能折叠/展开。
   * 这里转换为 RepoCollapseButton 的 disabled 状态，按钮仍可见但置灰不可点。
   */
  const repoCollapseDisabled = !selectedRepo;

  /**
   * 仓库栏切换统一入口：
   * - 宽屏：仅折叠 / 展开仓库列，保留当前选中仓库与会话。
   * - 中屏 / 窄屏：若当前在 sessions 或 entries 视图，点击则回到仓库列表，
   *   保证“选仓库后点左上角按钮没有效果”的 bug 不再出现。
   * 未选择仓库时统一 no-op，避免被绕过 disabled 进行状态編排。
   */
  const handleToggleRepoBar = useCallback(() => {
    if (repoCollapseDisabled) {
      return;
    }
    if (window.matchMedia("(min-width: 900px)").matches) {
      setRepoPanelCollapsed((prev) => !prev);
      return;
    }
    setCurrentView((prev) => (prev === "repos" ? "sessions" : "repos"));
  }, [repoCollapseDisabled]);

  /**
   * 切换查看仓库级目录：进入时清空当前 session，右侧/详情展示整个仓库的骨架，
   * 并将 currentView 设为 entries，以使单栏和双栏布局可以顺利跳转并渲染详情页
   */
  const handleViewRepoFiles = useCallback(() => {
    setSelectedSession(null);
    setViewingRepoFiles(true);
    setCurrentView("entries");
  }, []);

  const handleBackToRepos = useCallback(() => {
    setSelectedRepo(null);
    setSelectedSession(null);
    setViewingRepoFiles(false);
    setCurrentView("repos");
    setRepoPanelCollapsed(false);
  }, []);

  const handleBackToSessions = useCallback(() => {
    setSelectedSession(null);
    setViewingRepoFiles(false);
    setCurrentView("sessions");
  }, []);

  // Calculate stats to display in the header
  const stats = {
    repos: repos?.length ?? 0,
    sessions: sessions?.length ?? 0,
    entries: entries?.length ?? 0,
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // 仓库栏折叠按钮：VS Code 插件模式下注入到对应 Panel 的 leadingAction。
  // 仓库展开时需 Repositories 标题栏承载、折叠后需 Sessions 标题栏图标左侧承载。
  // standalone 模式不需要（已由 AppHeader 渲染），这里只在 VS Code 环境下构造。
  // ---------------------------------------------------------------------------
  const repoCollapseLeading = (
    <RepoCollapseButton
      collapsed={repoPanelCollapsed}
      onToggle={handleToggleRepoBar}
      disabled={repoCollapseDisabled}
    />
  );

  return (
    <AdaptiveLayout
      currentView={currentView}
      stats={stats}
      repoPanelCollapsed={repoPanelCollapsed}
      repos={repos ?? []}
      selectedRepo={selectedRepo}
      onSelectRepo={handleSelectRepo}
      onBackToRepos={handleBackToRepos}
      onBackToSessions={handleBackToSessions}
      selectedSession={selectedSession}
      viewingRepoFiles={viewingRepoFiles}
      repoPanel={
        <Panel
          title="Repositories"
          icon={<FolderGit2 className="w-3.5 h-3.5 text-text-secondary" />}
          leadingAction={repoCollapseLeading}
        >
          <RepoList
            repos={repos ?? []}
            selectedId={selectedRepo?.id ?? null}
            onSelect={handleSelectRepo}
            loading={reposLoading}
            sortOption={workspaceState.repoSort}
            onSortChange={(next) =>
              updateWorkspaceState({ repoSort: next })
            }
            pinnedIds={workspaceState.pinnedRepoIds}
            onPinnedChange={(next) =>
              updateWorkspaceState({ pinnedRepoIds: next })
            }
          />
        </Panel>
      }
      sessionPanel={
        <Panel
          title="Sessions"
          icon={<MessageSquare className="w-3.5 h-3.5 text-text-secondary" />}
          leadingAction={repoPanelCollapsed ? repoCollapseLeading : undefined}
          hideHeaderInNarrow={true}
        >
          <SessionList
            sessions={sessions ?? []}
            selectedId={selectedSession?.id ?? null}
            onSelect={handleSelectSession}
            loading={sessionsLoading}
            repoName={selectedRepo?.name}
            viewingRepoFiles={viewingRepoFiles}
            onSelectRepoFiles={handleViewRepoFiles}
            sortOption={workspaceState.sessionSort}
            onSortChange={(next) =>
              updateWorkspaceState({ sessionSort: next })
            }
            pinnedIds={workspaceState.pinnedSessionIds}
            onPinnedChange={(next) =>
              updateWorkspaceState({ pinnedSessionIds: next })
            }
          />
        </Panel>
      }
      entryPanel={
        <Panel
          title="Memory Entries"
          icon={<FileText className="w-3.5 h-3.5 text-text-secondary" />}
          hideHeaderInNarrow={true}
        >
          <MemoryViewer
            entries={entries ?? []}
            loading={entriesLoading}
            sessionTitle={
              viewingRepoFiles
                ? selectedRepo?.name
                : selectedSession?.title
            }
            sessionId={selectedSession?.id}
            // 仓库级目录视图信号：传入 repoId 且不传 sessionId 时切换到 repo 级文件树
            repoId={viewingRepoFiles ? selectedRepo?.id : undefined}
            repoName={viewingRepoFiles ? selectedRepo?.name : undefined}
            viewMode={viewingRepoFiles ? "repo" : "session"}
            previewEnabled={preferences.enableFilePreview}
            onPreviewEnabledChange={(next) =>
              updateUiPreferences({ enableFilePreview: next })
            }
            previewVisible={workspaceState.previewVisible}
            onPreviewVisibleChange={(next) =>
              updateWorkspaceState({ previewVisible: next })
            }
            fileTreeSort={workspaceState.fileTreeSort}
            onFileTreeSortChange={(next) =>
              updateWorkspaceState({ fileTreeSort: next })
            }
          />
        </Panel>
      }
    />
  );
}
