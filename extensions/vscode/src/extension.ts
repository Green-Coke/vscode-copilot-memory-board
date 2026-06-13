// ============================================================================
// extension.ts — VS Code Extension Entry Point
// ============================================================================
// 注册多区域入口以实现物理位置的快速跳转：
//   1) 在主侧栏、辅助侧栏、面板中注册 3 个独立的 View，并通过 when 条件在同一时刻只显式一个。
//   2) 注册独立 WebviewPanel（在编辑区中作为 Editor Tab 呈现）。
//   3) 注册并实现 5 个跳转命令，自动完成容器显隐、物理位置聚焦与状态持久化。
// ============================================================================

import * as vscode from "vscode";
import {
  MemoryBoardViewProvider,
  MemoryBoardPanelManager,
} from "./webview-provider";

/**
 * 控制 Memory Board 视图当前物理区域位置的上下文键。
 * 对应值可以是:
 * - "sidebar" (主侧栏，A)
 * - "editor" (编辑区，B)
 * - "secondarySidebar" (辅助侧栏，C)
 * - "panel" (下方面板栏，D)
 */
const ACTIVE_LOCATION_CONTEXT_KEY = "memoryBoard.activeLocation";

/**
 * 插件被激活时的入口方法。由 VS Code 自动调用。
 * 该方法负责初始化视图提供者、注册物理侧栏/面板视图、初始化并绑定跳转指令及持久化状态。
 * @param context VS Code 扩展运行上下文，用于注册订阅与访问持久状态
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log("[Memory Board] Extension activating...");

  // 实例化共享的 WebviewViewProvider，用于同时服务 A、C、D 三个物理容器
  const provider = new MemoryBoardViewProvider(context.extensionUri, context);

  // 注册主侧栏、辅助侧栏和底部面板栏的视图提供者，并加入销毁订阅
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "memoryBoard.mainView",
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    ),
    vscode.window.registerWebviewViewProvider(
      "memoryBoard.secondaryView",
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    ),
    vscode.window.registerWebviewViewProvider(
      "memoryBoard.bottomPanelView",
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // 独立面板管理器，专门管理编辑区 (B) 的 WebviewPanel 实例，并与 context 绑定
  const panelManager = new MemoryBoardPanelManager(
    context.extensionUri,
    context
  );

  // 从工作区持久状态中读取保存的激活位置，默认是主侧栏 "sidebar"
  const savedLocation = context.workspaceState.get<string>(
    ACTIVE_LOCATION_CONTEXT_KEY,
    "sidebar"
  );
  void vscode.commands.executeCommand(
    "setContext",
    ACTIVE_LOCATION_CONTEXT_KEY,
    savedLocation
  );

  /**
   * 辅助方法：统一更新 Memory Board 视图当前所在的物理位置上下文，并将其持久化在工作区状态中。
   * @param location 新的目标位置标识符 ("sidebar" | "editor" | "secondarySidebar" | "panel")
   */
  const updateLocation = async (
    location: "sidebar" | "editor" | "secondarySidebar" | "panel"
  ) => {
    await vscode.commands.executeCommand(
      "setContext",
      ACTIVE_LOCATION_CONTEXT_KEY,
      location
    );
    await context.workspaceState.update(ACTIVE_LOCATION_CONTEXT_KEY, location);
  };

  /**
   * 1) 移动至主侧栏 (A)
   * 销毁可能处于打开状态的编辑器 WebviewPanel 实例，并更新状态激活主侧栏中的 WebviewView，随后将其拉起并聚焦。
   */
  const moveToPrimarySidebar = async () => {
    panelManager.close();
    await updateLocation("sidebar");
    await vscode.commands.executeCommand(
      "workbench.view.extension.memory-board-sidebar"
    );
  };

  /**
   * 2) 移动至编辑区 (B)
   * 更新视图位置上下文状态为 "editor"，自动隐藏其它区域的 WebviewView，并在编辑器活动分组中打开 WebviewPanel。
   */
  const moveToEditor = async () => {
    await updateLocation("editor");
    await panelManager.open();
    // 强制将编辑器 WebviewPanel 移至第一组，避免其留在之前被放置的底部面板/辅助组中
    await vscode.commands.executeCommand("workbench.action.moveEditorToFirstGroup");
  };

  /**
   * 3) 移动至辅助侧栏 (C)
   * 销毁编辑器 WebviewPanel 实例，更新状态激活辅助侧栏中的 WebviewView，随后强制展开并聚焦该辅助侧栏容器。
   */
  const moveToSecondarySidebar = async () => {
    panelManager.close();
    await updateLocation("secondarySidebar");
    await vscode.commands.executeCommand(
      "workbench.view.extension.memory-board-secondary-sidebar-container"
    );
  };

  /**
   * 4) 移动至面板栏 (D)
   * 销毁编辑器 WebviewPanel 实例，更新状态激活底部面板栏中的 WebviewView，随后强制展开并聚焦该面板容器。
   */
  const moveToPanel = async () => {
    panelManager.close();
    await updateLocation("panel");
    await vscode.commands.executeCommand(
      "workbench.view.extension.memory-board-panel-container"
    );
  };

  /**
   * 5) 移动至新窗口
   * 如果当前不是处于编辑器模式，先将其转换为编辑器 WebviewPanel，随后运行内置命令将编辑器窗口分离至独立的新窗口中。
   */
  const moveToNewWindow = async () => {
    const currentLoc = context.workspaceState.get<string>(
      ACTIVE_LOCATION_CONTEXT_KEY,
      "sidebar"
    );
    if (currentLoc !== "editor" || !panelManager.isOpen()) {
      await moveToEditor();
    }
    // 调用 VS Code 官方将当前活动编辑器移动到新窗口的内置指令
    await vscode.commands.executeCommand("workbench.action.moveEditorToNewWindow");
  };

  // 注册上述 5 个跳转命令，并把它们添加进 context 的订阅销毁清单中
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "memoryBoard.moveToPrimarySidebar",
      moveToPrimarySidebar
    ),
    vscode.commands.registerCommand("memoryBoard.moveToEditor", moveToEditor),
    vscode.commands.registerCommand(
      "memoryBoard.moveToSecondarySidebar",
      moveToSecondarySidebar
    ),
    vscode.commands.registerCommand("memoryBoard.moveToPanel", moveToPanel),
    vscode.commands.registerCommand("memoryBoard.moveToNewWindow", moveToNewWindow)
  );

  // 侧栏与面板的全局刷新指令
  context.subscriptions.push(
    vscode.commands.registerCommand("memoryBoard.refresh", async () => {
      await provider.refresh();
      await panelManager.refresh();
    })
  );

  console.log("[Memory Board] Extension activated successfully.");
}

/**
 * 插件停用时的清理方法。由 VS Code 自动调用。
 */
export function deactivate(): void {
  console.log("[Memory Board] Extension deactivated.");
}
