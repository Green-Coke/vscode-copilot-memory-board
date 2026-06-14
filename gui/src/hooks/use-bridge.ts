// ============================================================================
// useBridge — React Hooks for Bridge Communication
// ============================================================================
// Provides typed React hooks that wrap the bridge API for easy use
// in components. Handles loading states, errors, and auto-refresh.
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import type {
  Workspace,
  Session,
  MemoryEntry,
  AnyPushMessage,
  UiPreferences,
  WorkspaceState,
} from "@memory-board/core";
import {
  DEFAULT_UI_PREFERENCES,
  DEFAULT_WORKSPACE_STATE,
} from "@memory-board/core";
import { sendRequest, onPushMessage } from "@/lib/bridge";

// ---------------------------------------------------------------------------
// Generic Async Data Hook
// ---------------------------------------------------------------------------

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// Domain-Specific Hooks
// ---------------------------------------------------------------------------

/**
 *Fetch the list of workspaces.
 * Automatically refreshes when the host pushes `onWorkspacesChanged`.
 */
export function useWorkspaces(): AsyncState<Workspace[]> {
  const state = useAsyncData<Workspace[]>(async () => {
    const response = await sendRequest("getWorkspaces", {});
    if (response.error) throw new Error(response.error);
    return (response.payload as { workspaces: Workspace[] }).workspaces;
  }, []);

  // Listen for push updates
  useEffect(() => {
    const unsub = onPushMessage((msg: AnyPushMessage) => {
      if (msg.type === "onWorkspacesChanged") {
        state.refetch();
      }
    });
    return unsub;
  }, [state.refetch]);

  return state;
}

/**
 * Fetch sessions for a specific workspace.
 *
 * @param workspaceId - The workspace ID to fetch sessions for, or null to skip.
 */
export function useSessionsByWorkspace(
  workspaceId: string | null
): AsyncState<Session[]> {
  return useAsyncData<Session[]>(async () => {
    if (!workspaceId) return [];
    const response = await sendRequest("getSessionsByWorkspace", { workspaceId });
    if (response.error) throw new Error(response.error);
    return (response.payload as { sessions: Session[] }).sessions;
  }, [workspaceId]);
}

/**
 * Fetch memory entries for a specific session.
 *
 * @param sessionId - The session ID to fetch entries for, or null to skip.
 * @param workspaceId - 可选的 workspaceId；standalone HTTP 通道需要此参数才能定位到	 *   workspaceStorage/<ws>/.../memories/<session>。VS Code 扩展端不传时会回退到
 *   currentWorkspaceId。
 */
export function useMemoryContent(
  sessionId: string | null,
  workspaceId?: string | null
): AsyncState<MemoryEntry[]> {
  return useAsyncData<MemoryEntry[]>(async () => {
    if (!sessionId) return [];
    const payload: { sessionId: string; workspaceId?: string } = { sessionId };
    if (workspaceId) {
      payload.workspaceId = workspaceId;
    }
    const response = await sendRequest("readMemoryContent", payload);
    if (response.error) throw new Error(response.error);
    return (response.payload as { entries: MemoryEntry[] }).entries;
  }, [sessionId, workspaceId]);
}

/**
 * "当前激活的工作区"。VS Code 扩展返回真实当前工作区；standalone 返回 undefined。
 * GUI 可以用它来自动选中当前工作区（仅首次，用户手动改选后不覆盖）。
 */
export function useCurrentWorkspace(): AsyncState<Workspace | null> {
  return useAsyncData<Workspace | null>(async () => {
    const response = await sendRequest("getCurrentWorkspace", {});
    if (response.error) throw new Error(response.error);
    const ws = (response.payload as { workspace?: Workspace }).workspace;
    return ws ?? null;
  }, []);
}

// ---------------------------------------------------------------------------
// UI Preferences & Workspace State Hooks
// ---------------------------------------------------------------------------

interface UiPreferencesState {
  preferences: UiPreferences;
  loading: boolean;
  /** 部分更新 UI 偏好（会与现有偏好合并并回写持久层） */
  update: (patch: Partial<UiPreferences>) => Promise<void>;
}

/**
 * 读取并更新跨工作区的全局 UI 偏好（如预览总开关）。
 * 初始渲染使用 DEFAULT_UI_PREFERENCES，加载完成后替换为持久层返回值。
 */
export function useUiPreferences(): UiPreferencesState {
  const [preferences, setPreferences] = useState<UiPreferences>(
    DEFAULT_UI_PREFERENCES
  );
  const [loading, setLoading] = useState(true);

  // 初始加载：从 bridge 拉取一次
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await sendRequest("getUiPreferences", {});
        if (!active) return;
        if (response.error) {
          console.warn("[useUiPreferences] 读取偏好失败:", response.error);
          return;
        }
        const data = (response.payload as { preferences: UiPreferences })
          .preferences;
        setPreferences({ ...DEFAULT_UI_PREFERENCES, ...data });
      } catch (err) {
        console.warn("[useUiPreferences] 读取偏好异常:", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback(async (patch: Partial<UiPreferences>) => {
    try {
      const response = await sendRequest("setUiPreferences", {
        preferences: patch,
      });
      if (response.error) {
        console.warn("[useUiPreferences] 更新偏好失败:", response.error);
        return;
      }
      const next = (response.payload as { preferences: UiPreferences })
        .preferences;
      setPreferences({ ...DEFAULT_UI_PREFERENCES, ...next });
    } catch (err) {
      console.warn("[useUiPreferences] 更新偏好异常:", err);
    }
  }, []);

  return { preferences, loading, update };
}

interface WorkspaceStateHook {
  state: WorkspaceState;
  loading: boolean;
  /** 部分更新工作区状态（会与现有状态合并并回写持久层） */
  update: (patch: Partial<WorkspaceState>) => Promise<void>;
}

/**
 * 读取并更新当前工作区的状态（排序、预览面板展开状态、钉选集合）。
 * 初始渲染使用 DEFAULT_WORKSPACE_STATE，加载完成后替换为持久层返回值。
 */
export function useWorkspaceState(): WorkspaceStateHook {
  const [state, setState] = useState<WorkspaceState>(cloneDefaultWorkspace());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await sendRequest("getWorkspaceState", {});
        if (!active) return;
        if (response.error) {
          console.warn("[useWorkspaceState] 读取状态失败:", response.error);
          return;
        }
        const data = (response.payload as { state: WorkspaceState }).state;
        setState(mergeWorkspace(cloneDefaultWorkspace(), data));
      } catch (err) {
        console.warn("[useWorkspaceState] 读取状态异常:", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback(async (patch: Partial<WorkspaceState>) => {
    try {
      const response = await sendRequest("setWorkspaceState", {
        state: patch,
      });
      if (response.error) {
        console.warn("[useWorkspaceState] 更新状态失败:", response.error);
        return;
      }
      const next = (response.payload as { state: WorkspaceState }).state;
      setState(mergeWorkspace(cloneDefaultWorkspace(), next));
    } catch (err) {
      console.warn("[useWorkspaceState] 更新状态异常:", err);
    }
  }, []);

  return { state, loading, update };
}

/**
 * 复制默认工作区状态，避免组件意外修改常量默认值
 */
function cloneDefaultWorkspace(): WorkspaceState {
  return {
    workspaceSort: { ...DEFAULT_WORKSPACE_STATE.workspaceSort },
    sessionSort: { ...DEFAULT_WORKSPACE_STATE.sessionSort },
    fileTreeSort: { ...DEFAULT_WORKSPACE_STATE.fileTreeSort },
    previewVisible: DEFAULT_WORKSPACE_STATE.previewVisible,
    pinnedWorkspaceIds: [...DEFAULT_WORKSPACE_STATE.pinnedWorkspaceIds],
    pinnedSessionIds: [...DEFAULT_WORKSPACE_STATE.pinnedSessionIds],
  };
}

/**
 * 将部分工作区状态安全合并到 base，已提供字段整体覆盖
 */
function mergeWorkspace(
  base: WorkspaceState,
  patch: Partial<WorkspaceState>
): WorkspaceState {
  return {
    workspaceSort: patch.workspaceSort ?? base.workspaceSort,
    sessionSort: patch.sessionSort ?? base.sessionSort,
    fileTreeSort: patch.fileTreeSort ?? base.fileTreeSort,
    previewVisible: patch.previewVisible ?? base.previewVisible,
    pinnedWorkspaceIds: patch.pinnedWorkspaceIds ?? base.pinnedWorkspaceIds,
    pinnedSessionIds: patch.pinnedSessionIds ?? base.pinnedSessionIds,
  };
}
