// ============================================================================
// Memory Board — VS Code Webview 宿主层
// ============================================================================
// 同时服务于两种入口：
//   1) 侧边栏 WebviewView（通过 MemoryBoardViewProvider 由 Activity Bar 解析）
//   2) 独立 WebviewPanel（通过 MemoryBoardPanelManager 以命令打开）
// 两种入口共用同一套 GUI 资源装配、CSP、消息桥接与状态持久化逻辑，
// 这些共享能力集中在 MemoryBoardWebviewCore 中实现，避免双入口行为漂移。
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

/**
 * 打包进扩展的 GUI 静态资源根目录（相对扩展根）
 */
const WEBVIEW_RESOURCE_ROOT = ["resources", "webview"];

/**
 * 生成用于 CSP 的随机 nonce（每次装配 webview 时都会刷新）
 */
function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * 为 Webview View/Panel 装配 HTML、CSP、资源路径以及消息桥的共享内核。
 *
 * 设计要点：
 * - 以 Vite 构建产物 `resources/webview/index.html` 作为单一事实来源，
 *   不再在扩展侧手写一份平行 HTML 模板。这样 GUI 的脚本类型（module）、
 *   资源文件名变化都会被自动反映，避免再次出现“脚本/CSP 与产物不一致”
 *   导致前端挂不起来的情况（曾表现为只剩浅黄色背景）。
 * - 自动把 HTML 中的相对资源引用改写为 `webview.asWebviewUri(...)` 形式，
 *   并显式注入满足 module 脚本与内联样式的 CSP。
 * - 侧边栏视图与独立面板复用同一个 attach 流程，保证两者行为一致。
 */
export class MemoryBoardWebviewCore {
  private readonly parser: MemoryParser;

  constructor(
    // 子类（ViewProvider / PanelManager）需要访问 context 订阅与 extensionUri 拼资源
    protected readonly extensionUri: vscode.Uri,
    protected readonly context: vscode.ExtensionContext
  ) {
    // 初始化 core 解析器，用于扫描 Copilot 记忆目录
    this.parser = new MemoryParser(
      path.join(
        process.env["APPDATA"] ?? process.env["HOME"] ?? "",
        "GitHub Copilot",
        "memory"
      )
    );
  }

  /**
   * 把同一套 GUI 装配到任意 webview 实例上（供 view / panel 共用）
   * 装配内容包括：本地资源授权、HTML、CSP、来自前端的 postMessage 监听
   * @param webview 要装配的目标 webview（来自 view 或 panel）
   */
  public attachWebview(webview: vscode.Webview): void {
    // 授权加载打包在扩展内的 GUI 静态资源
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, ...WEBVIEW_RESOURCE_ROOT),
        vscode.Uri.joinPath(this.extensionUri, "resources"),
      ],
    };

    // 装配页面内容（含资源改写与 CSP）
    webview.html = this.getHtmlForWebview(webview);

    // 监听来自前端的请求，统一路由到 core / 状态持久化
    webview.onDidReceiveMessage(
      (message: AnyRequest) => this.handleMessage(message, webview),
      undefined,
      this.context.subscriptions
    );
  }

  /**
   * 主动刷新：重新扫描仓库并推送给指定 webview
   * 用于侧边栏刷新命令；面板入口可选调用
   * @param webview 接收推送的目标 webview
   */
  public async refresh(webview: vscode.Webview): Promise<void> {
    try {
      const repos = await this.parser.scanRepositories();
      webview.postMessage({
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

  /**
   * 处理来自 webview 的单条请求；成功与失败都会回传一条响应
   * @param message 前端发来的协议请求
   * @param webview 响应需回传到的 webview 实例（避免多面板互相串扰）
   */
  private async handleMessage(
    message: AnyRequest,
    webview: vscode.Webview
  ): Promise<void> {
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

    webview.postMessage(response);
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
  // HTML Generation（以 Vite dist/index.html 为单一事实来源）
  // ---------------------------------------------------------------------------

  /**
   * 计算打包进扩展的 GUI 资源根目录的文件系统路径
   */
  private getGuiDistFsPath(): string {
    return vscode.Uri.joinPath(
      this.extensionUri,
      ...WEBVIEW_RESOURCE_ROOT
    ).fsPath;
  }

  /**
   * 为 webview 生成最终 HTML：
   * - 先读取 Vite 构建产物 index.html 作为模板
   * - 改写其中的相对资源引用为 webview 可访问的 URI
   * - 注入满足 module 脚本和内联样式的 CSP、补齐 nonce
   * - 如果资源缺失，返回友好的“GUI 未构建”兜底页
   * @param webview 当前 webview 实例（用于 asWebviewUri 与 cspSource）
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const guiDistFsPath = this.getGuiDistFsPath();
    const indexHtmlPath = path.join(guiDistFsPath, "index.html");

    // 同时校验 index.html 与核心 JS 资源存在，避免落入半可用状态
    const guiBuilt =
      fs.existsSync(indexHtmlPath) &&
      fs.existsSync(path.join(guiDistFsPath, "assets", "index.js"));

    if (!guiBuilt) {
      return this.buildNotBuiltFallbackHtml();
    }

    // 读取 Vite 构建产物作为模板
    let html = fs.readFileSync(indexHtmlPath, "utf8");

    // 资源根的 webview 基础 URI，供相对路径拼接（dist/index.html 中均为 "./" 开头）
    const webviewBase = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, ...WEBVIEW_RESOURCE_ROOT)
    );
    const nonce = getNonce();

    // 1) 移除 Vite 产物里指向 Google Fonts 的外部 link（webview 离线/受 CSP 限制会失败）
    html = html.replace(
      /<link[^>]*href="https:\/\/fonts\.googleapis\.com[^>]*>/gi,
      ""
    );
    html = html.replace(
      /<link[^>]*href="https:\/\/fonts\.gstatic\.com[^>]*>/gi,
      ""
    );

    // 2) 改写相对资源引用为 webview 可访问的绝对 URI
    //   - href="./assets/xxx" / href="assets/xxx" / src="./assets/xxx"
    html = html.replace(
      /((?:href|src)\s*=\s*")\.?\/?((?:assets|mock-data)[^"]*)"/gi,
      (_match, prefix, relPath) => `${prefix}${webviewBase}/${relPath}"`
    );

    // 3) 为脚本注入 nonce（Vite 产物本身不带 nonce；CSP 要求 script-src 用 nonce）
    html = html.replace(
      /<script(?![^>]*\snonce=)/gi,
      `<script nonce="${nonce}"`
    );

    // 4) 注入 CSP：允许 module 脚本、webview 源样式与内联样式、图片（含 data）
    //    注意：script-src 必须允许 'nonce-xxx' 才能执行带 nonce 的 module 脚本
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} https: data:`,
      `connect-src ${webview.cspSource}`,
    ].join("; ");

    // 如果模板已含 CSP meta（后续手动构建场景），替换；否则在 <head> 插入
    if (/<meta[^>]+http-equiv="Content-Security-Policy"/i.test(html)) {
      html = html.replace(
        /<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/i,
        `<meta http-equiv="Content-Security-Policy" content="${csp}">`
      );
    } else {
      html = html.replace(
        /<head[^>]*>/i,
        (match) => `${match}\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`
      );
    }

    return html;
  }

  /**
   * 当 GUI 资源未构建时显示的兜底页
   */
  private buildNotBuiltFallbackHtml(): string {
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
}

/**
 * 侧边栏 Webview View 提供者。
 *
 * 继承自共享内核 {@link MemoryBoardWebviewCore}，在 `resolveWebviewView`
 * 被调用时复用 `attachWebview` 装配 GUI。Activity Bar 中的 Memory Board
 * 视图使用这个 provider，保持侧边栏体验。
 */
export class MemoryBoardViewProvider extends MemoryBoardWebviewCore {
  public static readonly viewType = "memoryBoard.mainView";

  private view?: vscode.WebviewView;

  /**
   * Called by VS Code when the webview view needs to be resolved.
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    // 复用共享装配流程
    this.attachWebview(webviewView.webview);

    // 监听侧边栏视图可见性变化
    webviewView.onDidChangeVisibility(() => {
      console.log(
        `[Memory Board] View visibility changed: ${webviewView.visible}`
      );
    },
    undefined,
    this.context.subscriptions);
  }

  /**
   * 侧边栏刷新命令入口：刷新当前视图（若已解析）
   */
  public override async refresh(webview?: vscode.Webview): Promise<void> {
    if (webview) {
      await super.refresh(webview);
      return;
    }
    if (this.view) {
      await super.refresh(this.view.webview);
    }
  }
}

/**
 * 独立 WebviewPanel 管理者。
 *
 * 通过命令 `memoryBoard.openInPanel` 调用 {@link open}，在编辑器区域
 * 打开一个独立的 WebviewPanel。这种形态天然可以作为标签页移动、拆分、
 * 拖拽到编辑器组的任意位置，满足“像其他扩展一样可移动”的需求。
 * 当前实现采用单实例策略：再次调用命令会复用已存在的 panel。
 */
export class MemoryBoardPanelManager extends MemoryBoardWebviewCore {
  public static readonly viewType = "memoryBoard.panelView";

  private panel?: vscode.WebviewPanel;

  constructor(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    super(extensionUri, context);
  }

  /**
   * 打开（或聚焦）独立的 Memory Board 面板
   * 已存在则直接 reveal；不存在则新建并装配 GUI
   */
  public open(): void {
    // 单实例复用：已存在时直接聚焦，避免多窗口同时写 workspaceState 状态歧义
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active, false);
      return;
    }

    // 新建独立面板，作为编辑器标签页呈现（可移动/拆分/重排）
    const panel = vscode.window.createWebviewPanel(
      MemoryBoardPanelManager.viewType,
      "Memory Board",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, ...WEBVIEW_RESOURCE_ROOT),
          vscode.Uri.joinPath(this.extensionUri, "resources"),
        ],
      }
    );
    panel.iconPath = vscode.Uri.joinPath(
      this.extensionUri,
      "resources",
      "icon.svg"
    );

    this.panel = panel;

    // 复用共享装配流程
    this.attachWebview(panel.webview);

    // 面板关闭时清理引用，允许下次重新打开
    panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      undefined,
      this.context.subscriptions
    );
  }
}
