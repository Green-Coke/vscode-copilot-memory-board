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
import { MemoryParser, MessageTypes } from "@memory-board/core";
import type { AnyRequest, ResponseMessage } from "@memory-board/core";

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
        // Allow loading GUI build artifacts
        vscode.Uri.joinPath(this.extensionUri, "..", "..", "gui", "dist"),
        // Allow loading extension resources
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
  // HTML Generation
  // ---------------------------------------------------------------------------

  private getHtmlForWebview(webview: vscode.Webview): string {
    // Resolve the GUI dist directory
    const guiDistPath = vscode.Uri.joinPath(
      this.extensionUri,
      "..",
      "..",
      "gui",
      "dist"
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
