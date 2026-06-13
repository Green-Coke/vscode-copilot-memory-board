// ============================================================================
// useBridge — React Hooks for Bridge Communication
// ============================================================================
// Provides typed React hooks that wrap the bridge API for easy use
// in components. Handles loading states, errors, and auto-refresh.
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import type {
  Repository,
  Session,
  MemoryEntry,
  AnyPushMessage,
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
 * Fetch the list of repositories.
 * Automatically refreshes when the host pushes `onReposChanged`.
 */
export function useRepos(): AsyncState<Repository[]> {
  const state = useAsyncData<Repository[]>(async () => {
    const response = await sendRequest("getRepos", {});
    if (response.error) throw new Error(response.error);
    return (response.payload as { repos: Repository[] }).repos;
  }, []);

  // Listen for push updates
  useEffect(() => {
    const unsub = onPushMessage((msg: AnyPushMessage) => {
      if (msg.type === "onReposChanged") {
        state.refetch();
      }
    });
    return unsub;
  }, [state.refetch]);

  return state;
}

/**
 * Fetch sessions for a specific repository.
 *
 * @param repoId - The repository ID to fetch sessions for, or null to skip.
 */
export function useSessions(repoId: string | null): AsyncState<Session[]> {
  return useAsyncData<Session[]>(async () => {
    if (!repoId) return [];
    const response = await sendRequest("getSessionsByRepo", { repoId });
    if (response.error) throw new Error(response.error);
    return (response.payload as { sessions: Session[] }).sessions;
  }, [repoId]);
}

/**
 * Fetch memory entries for a specific session.
 *
 * @param sessionId - The session ID to fetch entries for, or null to skip.
 */
export function useMemoryContent(
  sessionId: string | null
): AsyncState<MemoryEntry[]> {
  return useAsyncData<MemoryEntry[]>(async () => {
    if (!sessionId) return [];
    const response = await sendRequest("readMemoryContent", { sessionId });
    if (response.error) throw new Error(response.error);
    return (response.payload as { entries: MemoryEntry[] }).entries;
  }, [sessionId]);
}
