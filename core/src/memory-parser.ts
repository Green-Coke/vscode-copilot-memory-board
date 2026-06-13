// ============================================================================
// @memory-board/core — MemoryParser
// ============================================================================
// Responsible for scanning local Copilot memory directories, resolving
// sessions, and reading memory entry content.
//
// Current implementation provides MOCK data for development and testing.
// Will be replaced with real filesystem scanning once the LTM file format
// research (docs/research.md) is complete.
// ============================================================================

import type { MemoryCategory, MemoryEntry, Repository, Session } from "./types.js";

/**
 * Parser for Copilot long-term memory files.
 *
 * This class encapsulates all logic for discovering, parsing, and
 * reading memory data from the local filesystem. It is a pure Node.js
 * module with no dependencies on VS Code APIs or browser globals.
 */
export class MemoryParser {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? "";
  }

  /**
   * Set or update the base directory for scanning memory files.
   */
  setBasePath(basePath: string): void {
    this.basePath = basePath;
  }

  /**
   * Scan the base directory and return a list of repositories
   * that contain Copilot memory data.
   *
   * @returns A promise that resolves to an array of Repository objects.
   */
  async scanRepositories(): Promise<Repository[]> {
    // --- MOCK IMPLEMENTATION ---
    // TODO: Replace with real fs.readdir + stat scanning
    return [
      {
        id: "repo-react-dashboard",
        name: "react-dashboard",
        path: `${this.basePath}/react-dashboard`,
        sessionCount: 3,
        lastModified: "2025-11-28T14:30:00Z",
      },
      {
        id: "repo-api-gateway",
        name: "api-gateway",
        path: `${this.basePath}/api-gateway`,
        sessionCount: 5,
        lastModified: "2025-12-01T09:15:00Z",
      },
      {
        id: "repo-mobile-app",
        name: "mobile-app",
        path: `${this.basePath}/mobile-app`,
        sessionCount: 2,
        lastModified: "2025-11-25T16:45:00Z",
      },
    ];
  }

  /**
   * Get all sessions belonging to a specific repository.
   *
   * @param repoId - The unique identifier of the repository.
   * @returns A promise that resolves to an array of Session objects.
   */
  async getSessionsByRepo(repoId: string): Promise<Session[]> {
    // --- MOCK IMPLEMENTATION ---
    const mockSessions: Record<string, Session[]> = {
      "repo-react-dashboard": [
        {
          id: "session-rd-001",
          repoId: "repo-react-dashboard",
          title: "Dashboard Layout Refactor",
          createdAt: "2025-11-28T10:00:00Z",
          entryCount: 4,
        },
        {
          id: "session-rd-002",
          repoId: "repo-react-dashboard",
          title: "State Management Migration",
          createdAt: "2025-11-27T08:30:00Z",
          entryCount: 6,
        },
        {
          id: "session-rd-003",
          repoId: "repo-react-dashboard",
          title: "Chart Component Integration",
          createdAt: "2025-11-26T14:00:00Z",
          entryCount: 3,
        },
      ],
      "repo-api-gateway": [
        {
          id: "session-ag-001",
          repoId: "repo-api-gateway",
          title: "Rate Limiting Implementation",
          createdAt: "2025-12-01T08:00:00Z",
          entryCount: 5,
        },
        {
          id: "session-ag-002",
          repoId: "repo-api-gateway",
          title: "Authentication Middleware",
          createdAt: "2025-11-30T11:00:00Z",
          entryCount: 8,
        },
      ],
      "repo-mobile-app": [
        {
          id: "session-ma-001",
          repoId: "repo-mobile-app",
          title: "Navigation Architecture",
          createdAt: "2025-11-25T09:00:00Z",
          entryCount: 3,
        },
      ],
    };

    return mockSessions[repoId] ?? [];
  }

  /**
   * Read all memory entries for a specific session.
   *
   * @param sessionId - The unique identifier of the session.
   * @returns A promise that resolves to an array of MemoryEntry objects.
   */
  async readMemoryContent(sessionId: string): Promise<MemoryEntry[]> {
    // --- MOCK IMPLEMENTATION ---
    const mockEntries: Record<string, MemoryEntry[]> = {
      "session-rd-001": [
        {
          id: "entry-rd-001-1",
          sessionId: "session-rd-001",
          content:
            "User prefers CSS Grid over Flexbox for complex dashboard layouts. Uses named grid areas for readability.",
          category: "preference" as MemoryCategory,
          timestamp: "2025-11-28T10:05:00Z",
          sourceFile: "memory-001.md",
        },
        {
          id: "entry-rd-001-2",
          sessionId: "session-rd-001",
          content:
            "Project uses React 19 with Server Components. Avoid suggesting class components or legacy lifecycle methods.",
          category: "context" as MemoryCategory,
          timestamp: "2025-11-28T10:12:00Z",
          sourceFile: "memory-002.md",
        },
        {
          id: "entry-rd-001-3",
          sessionId: "session-rd-001",
          content:
            "Always use TypeScript strict mode. Prefer `unknown` over `any`. Use `satisfies` operator for type narrowing.",
          category: "instruction" as MemoryCategory,
          timestamp: "2025-11-28T10:20:00Z",
          sourceFile: "memory-003.md",
        },
        {
          id: "entry-rd-001-4",
          sessionId: "session-rd-001",
          content:
            "The team follows the barrel export pattern — each feature directory has an index.ts that re-exports public APIs.",
          category: "pattern" as MemoryCategory,
          timestamp: "2025-11-28T10:30:00Z",
          sourceFile: "memory-004.md",
        },
      ],
      "session-ag-001": [
        {
          id: "entry-ag-001-1",
          sessionId: "session-ag-001",
          content:
            "Rate limiter uses a sliding window algorithm. Redis is used as the backing store with a 60-second TTL.",
          category: "knowledge" as MemoryCategory,
          timestamp: "2025-12-01T08:10:00Z",
          sourceFile: "memory-001.md",
        },
        {
          id: "entry-ag-001-2",
          sessionId: "session-ag-001",
          content:
            "API responses must follow the JSend specification: { status, data, message }.",
          category: "instruction" as MemoryCategory,
          timestamp: "2025-12-01T08:15:00Z",
          sourceFile: "memory-002.md",
        },
      ],
      "session-ma-001": [
        {
          id: "entry-ma-001-1",
          sessionId: "session-ma-001",
          content:
            "App uses React Navigation v7 with TypeScript-first stack navigator. All screen params are strictly typed.",
          category: "context" as MemoryCategory,
          timestamp: "2025-11-25T09:10:00Z",
          sourceFile: "memory-001.md",
        },
      ],
    };

    return mockEntries[sessionId] ?? [];
  }
}
