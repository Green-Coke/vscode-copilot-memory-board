// ============================================================================
// App — Main Application Component
// ============================================================================
// Wires together the bridge, hooks, and layout components to form the
// complete Memory Board UI. Manages navigation state for adaptive layout.
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import type { Repository, Session } from "@memory-board/core";
import { initBridge } from "@/lib/bridge";
import { useRepos, useSessions, useMemoryContent } from "@/hooks/use-bridge";
import { AdaptiveLayout, Panel, type ViewMode } from "@/components/Layout";
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
    setCurrentView("sessions");
  }, []);

  const handleSelectSession = useCallback((session: Session) => {
    setSelectedSession(session);
    setCurrentView("entries");
  }, []);

  const handleBackToRepos = useCallback(() => {
    setSelectedRepo(null);
    setSelectedSession(null);
    setCurrentView("repos");
  }, []);

  const handleBackToSessions = useCallback(() => {
    setSelectedSession(null);
    setCurrentView("sessions");
  }, []);

  // ---------------------------------------------------------------------------
  // Breadcrumb for narrow mode
  // ---------------------------------------------------------------------------

  const breadcrumbItems = [];

  breadcrumbItems.push({
    label: "Repos",
    onClick: currentView !== "repos" ? handleBackToRepos : undefined,
  });

  if (selectedRepo) {
    breadcrumbItems.push({
      label: selectedRepo.name,
      onClick: currentView === "entries" ? handleBackToSessions : undefined,
    });
  }

  if (selectedSession) {
    breadcrumbItems.push({
      label: selectedSession.title,
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AdaptiveLayout
      currentView={currentView}
      breadcrumbItems={breadcrumbItems}
      repoPanel={
        <Panel
          title="Repositories"
          icon={<FolderGit2 className="w-3.5 h-3.5 text-text-muted" />}
        >
          <RepoList
            repos={repos ?? []}
            selectedId={selectedRepo?.id ?? null}
            onSelect={handleSelectRepo}
            loading={reposLoading}
          />
        </Panel>
      }
      sessionPanel={
        <Panel
          title="Sessions"
          icon={<MessageSquare className="w-3.5 h-3.5 text-text-muted" />}
        >
          <SessionList
            sessions={sessions ?? []}
            selectedId={selectedSession?.id ?? null}
            onSelect={handleSelectSession}
            loading={sessionsLoading}
            repoName={selectedRepo?.name}
          />
        </Panel>
      }
      entryPanel={
        <Panel
          title="Memory Entries"
          icon={<FileText className="w-3.5 h-3.5 text-text-muted" />}
        >
          <MemoryViewer
            entries={entries ?? []}
            loading={entriesLoading}
            sessionTitle={selectedSession?.title}
          />
        </Panel>
      }
    />
  );
}
