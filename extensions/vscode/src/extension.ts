// ============================================================================
// extension.ts — VS Code Extension Entry Point
// ============================================================================
// 注册两种使用入口：
//   1) 侧边栏 WebviewView（通过 registerWebviewViewProvider 在 Activity Bar 中呈现）
//   2) 独立 WebviewPanel（通过 memoryBoard.openInPanel 命令打开，可作为编辑器标签移动）
// 两种入口共用 MemoryBoardWebviewCore，资源装配与状态行为保持一致。
// ============================================================================

import * as vscode from "vscode";
import {
  MemoryBoardViewProvider,
  MemoryBoardPanelManager,
} from "./webview-provider";

export function activate(context: vscode.ExtensionContext): void {
  console.log("[Memory Board] Extension activating...");

  // 1) 侧边栏入口：注册 WebviewViewProvider，由 Activity Bar 解析呈现
  const provider = new MemoryBoardViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MemoryBoardViewProvider.viewType,
      provider,
      {
        // 视图隐藏时保留状态，避免来回切换重新加载
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // 侧边栏刷新命令：重新扫描仓库并推送给当前侧边栏视图
  context.subscriptions.push(
    vscode.commands.registerCommand("memoryBoard.refresh", () => {
      provider.refresh();
    })
  );

  // 2) 独立面板入口：以命令打开可移动的编辑器标签式 WebviewPanel
  const panelManager = new MemoryBoardPanelManager(
    context.extensionUri,
    context
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("memoryBoard.openInPanel", () => {
      panelManager.open();
    })
  );

  console.log("[Memory Board] Extension activated successfully.");
}

export function deactivate(): void {
  console.log("[Memory Board] Extension deactivated.");
}
