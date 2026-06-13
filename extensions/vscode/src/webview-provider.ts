// ============================================================================
// MemoryBoardViewProvider — Webview Sidebar Provider
// ============================================================================
// Implements vscode.WebviewViewProvider to render the GUI in VS Code's
// sidebar. Acts as the "glue" layer: receives postMessage requests from
// the GUI, routes them to @memory-board/core, and sends responses back.
// ============================================================================

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  MemoryParser,
  MessageTypes,
  DEFAULT_UI_PREFERENCES,
  DEFAULT_WORKSPACE_STATE,
} from "@memory-board/core";
import type {
  AnyRequest,
  ResponseMessage,
  UiPreferences,
  WorkspaceState,
} from "@memory-board/core";

/**
 * 全局 UI 偏好在 globalState 中的 key
 * 属于跨工作区偏好（例如预览总开关），存储在 globalState
 */
const GLOBAL_UI_PREFERENCES_KEY = "memory-board.uiPreferences";

/**
 * 工作区状态在 workspaceState 中的 key
 * 属于工作区级偏好（排序、钉选、预览面板展开状态），存储在 workspaceState
 */
const WORKSPACE_STATE_KEY = "memory-board.workspaceState";

export class MemoryBoardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "memoryBoard.mainView";

  private view?: vscode.WebviewView;
  private readonly parser: MemoryParser;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    // Initialize the core parser
    // TODO: Determine the actual Copilot memory base path from research
    this.parser = new MemoryParser(
      path.join(
        process.env["APPDATA"] ?? process.env["HOME"] ?? "",
        "GitHub Copilot",
        "memory"
      )
    );
  }

  /**
   * Called by VS Code when the webview view needs to be resolved.
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        // 允许加载打包在扩展内的 GUI 静态资源
        vscode.Uri.joinPath(this.extensionUri, "resources", "webview"),
        // 允许加载扩展自身资源
        vscode.Uri.joinPath(this.extensionUri, "resources"),
      ],
    };

    // Set the HTML content
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Listen for messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message: AnyRequest) => this.handleMessage(message),
      undefined,
      this.context.subscriptions
    );

    // Log when the view becomes visible or hidden
    webviewView.onDidChangeVisibility(() => {
      console.log(
        `[Memory Board] View visibility changed: ${webviewView.visible}`
      );
    });
  }

  /**
   * Force a refresh by re-fetching repos and pushing to GUI.
   */
  public async refresh(): Promise<void> {
    if (!this.view) return;

    try {
      const repos = await this.parser.scanRepositories();
      this.view.webview.postMessage({
        type: MessageTypes.ON_REPOS_CHANGED,
        requestId: "",
        payload: { repos },
        error: null,
      });
    } catch (err) {
      console.error("[Memory Board] Refresh failed:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Message Router
  // ---------------------------------------------------------------------------

  private async handleMessage(message: AnyRequest): Promise<void> {
    if (!this.view) return;

    const msgType = message.type;
    const msgRequestId = message.requestId;
    console.log(`[Memory Board] Received message: ${msgType}`);

    let response: ResponseMessage;

    try {
      switch (message.type) {
        case MessageTypes.GET_REPOS: {
          const repos = await this.parser.scanRepositories();
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { repos },
            error: null,
          };
          break;
        }

        case MessageTypes.GET_SESSIONS_BY_REPO: {
          const { repoId } = message.payload as { repoId: string };
          const sessions = await this.parser.getSessionsByRepo(repoId);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { sessions },
            error: null,
          };
          break;
        }

        case MessageTypes.READ_MEMORY_CONTENT: {
          const { sessionId } = message.payload as { sessionId: string };
          const entries = await this.parser.readMemoryContent(sessionId);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { entries },
            error: null,
          };
          break;
        }

        case MessageTypes.GET_UI_PREFERENCES: {
          const prefs = this.readUiPreferences();
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { preferences: prefs },
            error: null,
          };
          break;
        }

        case MessageTypes.SET_UI_PREFERENCES: {
          const { preferences: patch } = message.payload as {
            preferences: Partial<UiPreferences>;
          };
          const next = this.writeUiPreferences(patch);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { preferences: next },
            error: null,
          };
          break;
        }

        case MessageTypes.GET_WORKSPACE_STATE: {
          const state = this.readWorkspaceState();
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { state },
            error: null,
          };
          break;
        }

        case MessageTypes.SET_WORKSPACE_STATE: {
          const { state: patch } = message.payload as {
            state: Partial<WorkspaceState>;
          };
          const next = this.writeWorkspaceState(patch);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { state: next },
            error: null,
          };
          break;
        }

        default:
          response = {
            type: msgType,
            requestId: msgRequestId,
            payload: {},
            error: `Unknown message type: ${msgType}`,
          };
      }
    } catch (err) {
      response = {
        type: msgType,
        requestId: msgRequestId,
        payload: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }

    this.view.webview.postMessage(response);
  }

  // ---------------------------------------------------------------------------
  // Preference & Workspace State Persistence Helpers
  // ---------------------------------------------------------------------------

  /**
   * 读取全局 UI 偏好；缺失字段用默认值补齐，返回完整的 UiPreferences
   */
  private readUiPreferences(): UiPreferences {
    const stored = this.context.globalState.get<Partial<UiPreferences>>(
      GLOBAL_UI_PREFERENCES_KEY
    );
    return { ...DEFAULT_UI_PREFERENCES, ...(stored ?? {}) };
  }

  /**
   * 部分更新全局 UI 偏好（合并后整体回写 globalState），返回最新完整值
   */
  private writeUiPreferences(patch: Partial<UiPreferences>): UiPreferences {
    const next = { ...this.readUiPreferences(), ...patch };
    void this.context.globalState.update(GLOBAL_UI_PREFERENCES_KEY, next);
    return next;
  }

  /**
   * 读取工作区状态；缺失字段用默认值补齐，返回完整的 WorkspaceState
   */
  private readWorkspaceState(): WorkspaceState {
    const stored = this.context.workspaceState.get<Partial<WorkspaceState>>(
      WORKSPACE_STATE_KEY
    );
    return this.mergeWorkspaceState(
      this.cloneDefaultWorkspaceState(),
      stored ?? {}
    );
  }

  /**
   * 部分更新工作区状态（合并后整体回写 workspaceState），返回最新完整值
   */
  private writeWorkspaceState(patch: Partial<WorkspaceState>): WorkspaceState {
    const next = this.mergeWorkspaceState(this.readWorkspaceState(), patch);
    void this.context.workspaceState.update(WORKSPACE_STATE_KEY, next);
    return next;
  }

  /**
   * 复制默认工作区状态，避免外部意外修改常量默认值
   */
  private cloneDefaultWorkspaceState(): WorkspaceState {
    return {
      repoSort: { ...DEFAULT_WORKSPACE_STATE.repoSort },
      sessionSort: { ...DEFAULT_WORKSPACE_STATE.sessionSort },
      fileTreeSort: { ...DEFAULT_WORKSPACE_STATE.fileTreeSort },
      previewVisible: DEFAULT_WORKSPACE_STATE.previewVisible,
      pinnedRepoIds: [...DEFAULT_WORKSPACE_STATE.pinnedRepoIds],
      pinnedSessionIds: [...DEFAULT_WORKSPACE_STATE.pinnedSessionIds],
    };
  }

  /**
   * 将部分工作区状态安全合并到 base；嵌套对象如 SortOption 整体覆盖
   */
  private mergeWorkspaceState(
    base: WorkspaceState,
    patch: Partial<WorkspaceState>
  ): WorkspaceState {
    return {
      repoSort: patch.repoSort ?? base.repoSort,
      sessionSort: patch.sessionSort ?? base.sessionSort,
      fileTreeSort: patch.fileTreeSort ?? base.fileTreeSort,
      previewVisible: patch.previewVisible ?? base.previewVisible,
      pinnedRepoIds: patch.pinnedRepoIds ?? base.pinnedRepoIds,
      pinnedSessionIds: patch.pinnedSessionIds ?? base.pinnedSessionIds,
    };
  }

  // ---------------------------------------------------------------------------
  // HTML Generation
  // ---------------------------------------------------------------------------

  private getHtmlForWebview(webview: vscode.Webview): string {
    // 解析打包在扩展内的 GUI 静态资源目录
    const guiDistPath = vscode.Uri.joinPath(
      this.extensionUri,
      "resources",
      "webview"
    );

    // Get URIs for the built JS and CSS assets
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(guiDistPath, "assets", "index.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(guiDistPath, "assets", "index.css")
    );

    // Generate a nonce for Content Security Policy
    const nonce = getNonce();

    // Check if GUI has been built
    const guiDistFsPath = guiDistPath.fsPath;
    const guiBuilt =
      fs.existsSync(guiDistFsPath) &&
      fs.existsSync(path.join(guiDistFsPath, "assets", "index.js"));

    if (!guiBuilt) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      padding: 20px;
      text-align: center;
    }
    .icon { font-size: 32px; margin-bottom: 12px; opacity: 0.6; }
    h2 { font-size: 14px; margin-bottom: 8px; }
    p { font-size: 12px; opacity: 0.7; }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="icon">🧠</div>
  <h2>Memory Board — GUI Not Built</h2>
  <p>Please build the GUI package first:</p>
  <p><code>pnpm --filter @memory-board/gui build</code></p>
</body>
</html>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}';
      font-src ${webview.cspSource};
      img-src ${webview.cspSource} https: data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Memory Board</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
