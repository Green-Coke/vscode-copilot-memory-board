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
import { sendRequest, onPushMessage, getInjectedInitialState } from "@/lib/bridge";
import i18n, { isSupportedLocale } from "@/i18n";

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
  const state = useAsyncData<Session[]>(async () => {
    if (!workspaceId) return [];
    const response = await sendRequest("getSessionsByWorkspace", { workspaceId });
    if (response.error) throw new Error(response.error);
    return (response.payload as { sessions: Session[] }).sessions;
  }, [workspaceId]);

  // 监听推送消息：当工作区数据改变或点击刷新按钮时自动更新当前会话列表
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
  const state = useAsyncData<MemoryEntry[]>(async () => {
    if (!sessionId) return [];
    const payload: { sessionId: string; workspaceId?: string } = { sessionId };
    if (workspaceId) {
      payload.workspaceId = workspaceId;
    }
    const response = await sendRequest("readMemoryContent", payload);
    if (response.error) throw new Error(response.error);
    return (response.payload as { entries: MemoryEntry[] }).entries;
  }, [sessionId, workspaceId]);

  // 监听推送消息：当工作区数据改变（包含内部复制/剪切/粘贴/删除）或手动刷新时同步更新文件内容树
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
  /** 是否展示重定向选择器 */
  showRedirectSelector: boolean;
  /** 是否处于 Antigravity IDE 宿主环境下（保留兼容） */
  isAgy: boolean;
  /** 部分更新 UI 偏好（会与现有偏好合并并回写持久层） */
  update: (patch: Partial<UiPreferences>) => Promise<void>;
}

/**
 * 读取并更新跨工作区的全局 UI 偏好（如预览总开关）。
 * 初始渲染使用 DEFAULT_UI_PREFERENCES，加载完成后替换为持久层返回值。
 */
export function useUiPreferences(): UiPreferencesState {
  const injected = getInjectedInitialState();
  const [preferences, setPreferences] = useState<UiPreferences>(
    injected?.uiPreferences ?? DEFAULT_UI_PREFERENCES
  );
  const [showRedirectSelector, setShowRedirectSelector] = useState(
    injected?.showRedirectSelector ?? false
  );
  const [loading, setLoading] = useState(!injected?.uiPreferences);

  // 初始加载：从 bridge 拉取一次（若没有注入的初始状态）
  useEffect(() => {
    // 如果有注入的状态，直接同步处理语言即可，不需要再去发请求
    if (injected?.uiPreferences) {
      if (injected.language) {
        const targetLocale = isSupportedLocale(injected.language);
        if (i18n.language !== targetLocale) {
          void i18n.changeLanguage(targetLocale);
        }
      }
      return;
    }

    let active = true;
    (async () => {
      try {
        const response = await sendRequest("getUiPreferences", {});
        if (!active) return;
        if (response.error) {
          console.warn("[useUiPreferences] 读取偏好失败:", response.error);
          return;
        }
        const payload = response.payload as {
          preferences: UiPreferences;
          showRedirectSelector?: boolean;
          isAgy?: boolean;
          language?: string;
        };
        setPreferences({ ...DEFAULT_UI_PREFERENCES, ...payload.preferences });
        
        // 优先使用 showRedirectSelector，其次使用 isAgy
        if (payload.showRedirectSelector !== undefined) {
          setShowRedirectSelector(payload.showRedirectSelector);
        } else if (payload.isAgy !== undefined) {
          setShowRedirectSelector(payload.isAgy);
        }

        // 注入显示语言：把 vscode.env.language 映射到支持的 locale（zh-cn / en）后切换
        // 切换是异步的，React 组件用 useTranslation() 会自动 re-render
        if (payload.language) {
          const targetLocale = isSupportedLocale(payload.language);
          // 仅在语言实际变化时调用 changeLanguage（避免初始化时的多余 re-render）
          if (i18n.language !== targetLocale) {
            void i18n.changeLanguage(targetLocale);
          }
        }
      } catch (err) {
        console.warn("[useUiPreferences] 读取偏好异常:", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [injected]);

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

  return { preferences, loading, showRedirectSelector, isAgy: showRedirectSelector, update };
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
  const injected = getInjectedInitialState();
  const [state, setState] = useState<WorkspaceState>(
    injected?.workspaceState ?? cloneDefaultWorkspace()
  );
  const [loading, setLoading] = useState(!injected?.workspaceState);

  useEffect(() => {
    if (injected?.workspaceState) {
      return;
    }
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
  }, [injected]);

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
    // 仅展示有记忆的工作区状态
    onlyShowWithMemories: DEFAULT_WORKSPACE_STATE.onlyShowWithMemories,
    // 仅展示有条目的会话状态
    onlyShowWithEntries: DEFAULT_WORKSPACE_STATE.onlyShowWithEntries,
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
    // 合并仅展示有记忆的工作区配置
    onlyShowWithMemories: patch.onlyShowWithMemories ?? base.onlyShowWithMemories,
    // 合并仅展示有条目的会话配置
    onlyShowWithEntries: patch.onlyShowWithEntries ?? base.onlyShowWithEntries,
  };
}

// ---------------------------------------------------------------------------
// 文件操作 Hooks
// ---------------------------------------------------------------------------

/**
 * 复制文件/目录到目标文件夹的 hook
 * @returns 执行复制操作的异步函数
 */
export function useCopyEntries() {
  return useCallback(async (sourcePaths: string[], targetDir: string) => {
    const response = await sendRequest("copyEntries", { sourcePaths, targetDir });
    if (response.error) throw new Error(response.error);
  }, []);
}

/**
 * 移动文件/目录到目标文件夹的 hook（也用于剪切+粘贴）
 * @returns 执行移动操作的异步函数
 */
export function useMoveEntries() {
  return useCallback(async (sourcePaths: string[], targetDir: string) => {
    const response = await sendRequest("moveEntries", { sourcePaths, targetDir });
    if (response.error) throw new Error(response.error);
  }, []);
}

/**
 * 重命名文件/目录的 hook（仅同目录改名）
 * @returns 执行重命名操作的异步函数
 */
export function useRenameEntry() {
  return useCallback(async (entryPath: string, newName: string) => {
    const response = await sendRequest("renameEntry", { path: entryPath, newName });
    if (response.error) throw new Error(response.error);
  }, []);
}

/**
 * 删除文件/目录的 hook。默认使用系统回收站。
 * @returns 执行删除操作的异步函数
 */
export function useDeleteEntries() {
  return useCallback(async (paths: string[], useTrash = true) => {
    const response = await sendRequest("deleteEntries", { paths, useTrash });
    if (response.error) throw new Error(response.error);
  }, []);
}

/**
 * 创建目录的 hook
 * @returns 执行创建目录操作的异步函数
 */
export function useCreateDirectory() {
  return useCallback(async (dirPath: string) => {
    const response = await sendRequest("createDirectory", { path: dirPath });
    if (response.error) throw new Error(response.error);
  }, []);
}

/**
 * 导入外部文件的 hook（用于拖拽导入场景）
 * @returns 执行导入操作的异步函数
 */
export function useImportExternalFile() {
  return useCallback(
    async (targetDir: string, name: string, contentBase64: string, sizeBytes: number) => {
      const response = await sendRequest("importExternalFile", {
        targetDir,
        name,
        contentBase64,
        sizeBytes,
      });
      if (response.error) throw new Error(response.error);
    },
    []
  );
}

/**
 * 在系统资源管理器中显示文件/目录的 hook
 * @returns 执行显示操作的异步函数
 */
export function useRevealInOs() {
  return useCallback(async (filePath: string) => {
    const response = await sendRequest("revealInOs", { path: filePath });
    if (response.error) throw new Error(response.error);
  }, []);
}

/**
 * 复制文件路径到系统剪贴板的 hook
 * @returns 执行复制路径操作的异步函数
 */
export function useCopyPath() {
  return useCallback(
    async (filePath: string, relative = false, workspaceId?: string) => {
      const response = await sendRequest("copyPathToClipboard", {
        path: filePath,
        relative,
        workspaceId,
      });
      if (response.error) throw new Error(response.error);
    },
    []
  );
}

/**
 * 读取系统剪贴板中文件列表的 hook（用于外部粘贴）。
 * 仅 Windows 支持，其他平台返回 unsupported。
 * @returns 执行读取操作的异步函数
 */
export function useReadExternalClipboardFiles() {
  return useCallback(async (): Promise<{ paths: string[]; unsupported?: boolean }> => {
    const response = await sendRequest("readExternalClipboardFiles", {});
    if (response.error) throw new Error(response.error);
    const payload = response.payload as { paths: string[]; unsupported?: boolean };
    return { paths: payload.paths ?? [], unsupported: payload.unsupported };
  }, []);
}

interface WorkspaceSizesState {
  sizes: Record<string, number>;
  requestCompute: (ids: string[]) => void;
}

/**
 * 监听各个工作区大小的推送更新，并提供请求计算函数的 React hook
 */
export function useWorkspaceSizes(): WorkspaceSizesState {
  const [sizes, setSizes] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsub = onPushMessage((msg: AnyPushMessage) => {
      if (msg.type === "onWorkspaceSizesChanged") {
        const payload = msg.payload as { sizes: Record<string, number> };
        setSizes((prev) => ({ ...prev, ...payload.sizes }));
      }
    });
    return unsub;
  }, []);

  const requestCompute = useCallback((workspaceIds: string[]) => {
    void sendRequest("computeWorkspaceSizes", { workspaceIds });
  }, []);

  return { sizes, requestCompute };
}

