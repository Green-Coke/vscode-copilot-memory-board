// ============================================================================
// extension.ts — VS Code Extension Entry Point
// ============================================================================
// Registers the WebviewViewProvider for the Memory Board sidebar panel
// and initializes the core MemoryParser.
// ============================================================================

import * as vscode from "vscode";
import { MemoryBoardViewProvider } from "./webview-provider";

export function activate(context: vscode.ExtensionContext): void {
  console.log("[Memory Board] Extension activating...");

  // Register the WebviewViewProvider for the sidebar
  const provider = new MemoryBoardViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MemoryBoardViewProvider.viewType,
      provider,
      {
        // Keep the webview alive when it's not visible to preserve state
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Register a command to refresh the board
  context.subscriptions.push(
    vscode.commands.registerCommand("memoryBoard.refresh", () => {
      provider.refresh();
    })
  );

  console.log("[Memory Board] Extension activated successfully.");
}

export function deactivate(): void {
  console.log("[Memory Board] Extension deactivated.");
}
