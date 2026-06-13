// ============================================================================
// extension.ts — VS Code Extension Entry Point
// ============================================================================
// 注册两种使用入口：
//   1) 侧边栏 WebviewView（通过 registerWebviewViewProvider 在 Activity Bar 中呈现）
//   2) 独立 WebviewPanel（通过 memoryBoard.openInPanel / moveToEditor 命令打开）
// “迁移到编辑器”语义：打开面板时用 setContext 隐藏侧边栏视图，关闭面板时恢复。
// ============================================================================

import * as vscode from "vscode";
import {
  MemoryBoardViewProvider,
  MemoryBoardPanelManager,
} from "./webview-provider";

/**
 * 控制侧边栏 Memory Board 视图可见性的上下文键。
 * - true：视图被隐藏（已迁移到编辑器面板）
 * - false / 未设置：视图在侧边栏正常显示
 *
 * 对应 package.json 中 view 的 when 条件：
 *   "when": "memoryBoard.movedToPanel == false"
 */
const MOVED_CONTEXT_KEY = "memoryBoard.movedToPanel";

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

  // 2) 独立面板管理者：负责单实例 WebviewPanel，并维护迁移状态
  const panelManager = new MemoryBoardPanelManager(
    context.extensionUri,
    context
  );

  /**
   * 把 Memory Board 从侧边栏迁移到编辑器区域。
   * 实现“真迁移”语义：打开面板 + 隐藏侧边栏视图；面板关闭时再恢复。
   */
  const moveToEditor = async () => {
    await panelManager.open();
    // 切换上下文，侧边栏视图根据 when 条件隐藏
    await vscode.commands.executeCommand("setContext", MOVED_CONTEXT_KEY, true);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("memoryBoard.moveToEditor", moveToEditor)
  );

  // 保留旧命令作为兼容入口，行为等同于迁移到编辑器
  context.subscriptions.push(
    vscode.commands.registerCommand("memoryBoard.openInPanel", moveToEditor)
  );

  // 侧边栏 / 面板刷新命令：重新扫描仓库并推送给所有已装配的入口
  context.subscriptions.push(
    vscode.commands.registerCommand("memoryBoard.refresh", async () => {
      await provider.refresh();
      await panelManager.refresh();
    })
  );

  console.log("[Memory Board] Extension activated successfully.");
}

export function deactivate(): void {
  console.log("[Memory Board] Extension deactivated.");
}
