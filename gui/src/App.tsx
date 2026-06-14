// ============================================================================
// App — Main Application Component
// ============================================================================
// Wires together the bridge, hooks, and layout components to form the
// complete Memory Board UI. Manages navigation state for adaptive layout.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import type { Workspace, Session } from "@memory-board/core";
import { DEFAULT_SESSION_IDS } from "@memory-board/core";
import { initBridge } from "@/lib/bridge";
import {
  useWorkspaces,
  useSessionsByWorkspace,
  useMemoryContent,
  useCurrentWorkspace,
  useUiPreferences,
  useWorkspaceState,
} from "@/hooks/use-bridge";
import { AdaptiveLayout, Panel, WorkspaceCollapseButton, type ViewMode } from "@/components/Layout";
import { WorkspaceList } from "@/components/WorkspaceList";
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

  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>("workspaces");
  const [workspacePanelCollapsed, setWorkspacePanelCollapsed] = useState(false);
  // 标记右侧当前是否展示 "工作区级目录" 视图；选中某个 session 时会被清空
  const [viewingWorkspaceFiles, setViewingWorkspaceFiles] = useState(false);

  // 标记用户是否手动选过 workspace。仅首次启动时让 currentWorkspace 自动选中；
  // 后续用户点了任意 workspace 后置 true，避免被覆盖
  const userPickedWorkspaceRef = useRef(false);

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

  const { data: workspaces, loading: workspacesLoading } = useWorkspaces();
  // “当前激活的工作区”（VS Code 模式返回真实值；standalone 返回 null）
  const { data: currentWs } = useCurrentWorkspace();
  // 该 ref 用于让自动选中只在 1) 开局启动时；2) currentWs 有值且未超过启动期间生效，避免 race
  const selectedWorkspaceId = selectedWorkspace?.id ?? null;

  // 当 workspaces 加载完成且用户还没选过，默认进入 currentWs（或任选首个）。
  useEffect(() => {
    if (userPickedWorkspaceRef.current) return;
    if (!workspaces || workspaces.length === 0) return;
    // 优先选 currentWs，其次是首个列表项
    const target = (currentWs && workspaces.find((w) => w.id === currentWs.id)) || workspaces[0];
    if (!target) return;
    if (selectedWorkspace && selectedWorkspace.id === target.id) return;
    setSelectedWorkspace(target);
    setViewingWorkspaceFiles(false);
    setCurrentView("sessions");
  }, [workspaces, currentWs, selectedWorkspace]);

  const { data: sessions, loading: sessionsLoading } = useSessionsByWorkspace(
    selectedWorkspaceId
  );

  // 当处于“工作区级目录"视图时，拉 _repo_ session 的 memory；否则拉选中 session 的内容。
  // workspaceId 传为 standalone HTTP 通道必须（VS Code 扩展端会回退到 currentWorkspaceId）。
  const memorySessionId = viewingWorkspaceFiles
    ? DEFAULT_SESSION_IDS.REPO
    : selectedSession?.id ?? null;
  const { data: entries, loading: entriesLoading } = useMemoryContent(
    memorySessionId,
    selectedWorkspaceId
  );

  // ---------------------------------------------------------------------------
  // Navigation Handlers
  // ---------------------------------------------------------------------------

  const handleSelectWorkspace = useCallback((workspace: Workspace) => {
    userPickedWorkspaceRef.current = true;
    setSelectedWorkspace(workspace);
    setSelectedSession(null);
    setViewingWorkspaceFiles(false);
    setCurrentView("sessions");
    // 桌面宽屏下不再自动折叠工作区栏，保持工作区 / 会话 / 条目三栏始终可见；
    // 仅窄屏经由 currentView 切页，workspacePanelCollapsed 仍可由顶部按钮手动控制
  }, []);

  const handleSelectSession = useCallback((session: Session) => {
    setSelectedSession(session);
    // 选中具体会话后退出工作区级目录视图
    setViewingWorkspaceFiles(false);
    setCurrentView("entries");
  }, []);

  /**
   * 未选中工作区时禁止折叠工作区栏：保留选中工作区才能折叠/展开。
   * 这里转换为 WorkspaceCollapseButton 的 disabled 状态，按钮仍可见但置灰不可点。
   */
  const workspaceCollapseDisabled = !selectedWorkspace;

  /**
   * 工作区栏切换统一入口：
   * - 宽屏：仅折叠 / 展开工作区列，保留当前选中工作区与会话。
   * - 中屏 / 窄屏：若当前在 sessions 或 entries 视图，点击则回到工作区列表，
   *   保证“选工作区后点左上角按钮没有效果”的 bug 不再出现。
   * 未选择工作区时统一 no-op，避免被绕过 disabled 进行状态编排。
   */
  const handleToggleWorkspaceBar = useCallback(() => {
    if (workspaceCollapseDisabled) {
      return;
    }
    if (window.matchMedia("(min-width: 900px)").matches) {
      setWorkspacePanelCollapsed((prev) => !prev);
      return;
    }
    setCurrentView((prev) => (prev === "workspaces" ? "sessions" : "workspaces"));
  }, [workspaceCollapseDisabled]);

  /**
   * 切换查看工作区级目录：进入时清空当前 session，右侧/详情展示整个工作区的骨架，
   * 并将 currentView 设为 entries，以使单栏和双栏布局可以顺利跳转并渲染详情页
   */
  const handleViewWorkspaceFiles = useCallback(() => {
    setSelectedSession(null);
    setViewingWorkspaceFiles(true);
    setCurrentView("entries");
  }, []);

  const handleBackToWorkspaces = useCallback(() => {
    // 切回工作区列表视图，但不清空 selectedWorkspace（保留上下文 / currentWorkspace 默认选中项）
    setSelectedSession(null);
    setViewingWorkspaceFiles(false);
    setCurrentView("workspaces");
    setWorkspacePanelCollapsed(false);
  }, []);

  const handleBackToSessions = useCallback(() => {
    setSelectedSession(null);
    setViewingWorkspaceFiles(false);
    setCurrentView("sessions");
  }, []);

  // Calculate stats to display in the header
  // 注意：与 AppHeaderProps.stats 字段对齐 (workspaces / sessions / entries)
  const stats = {
    workspaces: workspaces?.length ?? 0,
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
  const workspaceCollapseLeading = (
    <WorkspaceCollapseButton
      collapsed={workspacePanelCollapsed}
      onToggle={handleToggleWorkspaceBar}
      disabled={workspaceCollapseDisabled}
    />
  );

  return (
    <AdaptiveLayout
      currentView={currentView}
      stats={stats}
      repoPanelCollapsed={workspacePanelCollapsed}
      repos={workspaces ?? []}
      selectedRepo={selectedWorkspace}
      onSelectRepo={handleSelectWorkspace}
      onBackToRepos={handleBackToWorkspaces}
      onBackToSessions={handleBackToSessions}
      selectedSession={selectedSession}
      viewingRepoFiles={viewingWorkspaceFiles}
      repoPanel={
        <Panel
          title="工作区"
          icon={<FolderGit2 className="w-3.5 h-3.5 text-text-secondary" />}
          leadingAction={workspaceCollapseLeading}
        >
          <WorkspaceList
            workspaces={workspaces ?? []}
            selectedId={selectedWorkspace?.id ?? null}
            onSelect={handleSelectWorkspace}
            loading={workspacesLoading}
            sortOption={workspaceState.workspaceSort}
            onSortChange={(next) =>
              updateWorkspaceState({ workspaceSort: next })
            }
            pinnedIds={workspaceState.pinnedWorkspaceIds}
            onPinnedChange={(next) =>
              updateWorkspaceState({ pinnedWorkspaceIds: next })
            }
          />
        </Panel>
      }
      sessionPanel={
        <Panel
          title="Sessions"
          icon={<MessageSquare className="w-3.5 h-3.5 text-text-secondary" />}
          leadingAction={workspacePanelCollapsed ? workspaceCollapseLeading : undefined}
          hideHeaderInNarrow={true}
        >
          <SessionList
            sessions={sessions ?? []}
            selectedId={selectedSession?.id ?? null}
            onSelect={handleSelectSession}
            loading={sessionsLoading}
            workspaceName={selectedWorkspace?.name}
            viewingWorkspaceFiles={viewingWorkspaceFiles}
            onSelectWorkspaceFiles={handleViewWorkspaceFiles}
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
              viewingWorkspaceFiles
                ? selectedWorkspace?.name
                : selectedSession?.title
            }
            sessionId={selectedSession?.id}
            // 工作区级目录视图信号：传入 workspaceId 且不传 sessionId 时切换到工作区级文件树
            workspaceId={viewingWorkspaceFiles ? selectedWorkspace?.id : undefined}
            workspaceName={viewingWorkspaceFiles ? selectedWorkspace?.name : undefined}
            viewMode={viewingWorkspaceFiles ? "workspace" : "session"}
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
