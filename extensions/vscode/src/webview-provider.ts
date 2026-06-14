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
  OpenFileRequest,
  ResponseMessage,
  UiPreferences,
  Workspace,
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
  /**
   * 供 webview / panel 共用的 memory 解析器实例。
   * 通过 initParser() 延迟初始化，依赖 context.storageUri 反推 workspaceStorage 根路径。
   */
  private parser: MemoryParser | undefined;

  /**
   * 当前激活 workspaceId（从 storageUri 反推；不可用时为 undefined）。
   * 用于仅扫描本地工作区时限定。
   */
  private readonly currentWorkspaceId: string | undefined;

  /**
   * workspaceStorage 根目录的绝对路径。
   * 形如 Windows: C:/Users/xxx/AppData/Roaming/Code/User/workspaceStorage
   *       Insiders:  C:/Users/xxx/AppData/Roaming/Code - Insiders/User/workspaceStorage
   */
  private readonly workspaceStoragePath: string | undefined;

  /**
   * 多 workspace 缓存：启动时初始化 + 用户点击刷新时更新。
   * 避免每次 webview 渲染都重新遍历全部 workspaceStorage 目录。
   */
  private workspacesCache: Workspace[] | undefined;

  constructor(
    // 子类（ViewProvider / PanelManager）需要访问 context 订阅与 extensionUri 拼资源
    protected readonly extensionUri: vscode.Uri,
    protected readonly context: vscode.ExtensionContext
  ) {
    // 从 context.storageUri 反推 workspaceStorage 根路径
    // storageUri 形如 "…/workspaceStorage/<workspaceId>/<extensionId>"
    const resolved = this.resolveWorkspaceStoragePath();
    this.workspaceStoragePath = resolved?.workspaceStoragePath;
    this.currentWorkspaceId = resolved?.workspaceId;

    if (this.workspaceStoragePath && this.currentWorkspaceId) {
      // 优先读 dev/test 环境变量覆盖（e2e 注入 tmpdir mock 时使用）
      const override = process.env["MEMORY_BOARD_WS_STORAGE_OVERRIDE"];
      const basePath = (override && override.trim().length > 0) ? override : this.workspaceStoragePath;
      this.parser = new MemoryParser({
        basePath,
        currentWorkspaceId: this.currentWorkspaceId,
      });
      console.log(
        `[Memory Board] MemoryParser initialized: workspaceId=${this.currentWorkspaceId}, basePath=${basePath}`,
      );
    } else {
      console.warn(
        "[Memory Board] context.storageUri unavailable; memory scanning disabled until next refresh.",
      );
    }
  }

  /**
   * 从 context.storageUri 反推 workspaceStorage 根路径与当前 workspaceId。
   *
   * storageUri 标准结构：
   *   <workspaceStorageHome>/<workspaceId>/<extensionId>
   * 例如：
   *   C:/Users/25388/AppData/Roaming/Code/User/workspaceStorage/<hex32>/memory-board.memory-board
   *
   * 向上 2 级获得 workspaceStorageHome；倒数第 2 级是 workspaceId。
   *
   * 本方法同时与 vscode.env.uriScheme 做兼容校验：
   * 正式版 uriScheme="code"、Insiders="code-insiders"。
   * 若 storageUri 不可用（例如扩展被未在 workspace 中激活）则返回 undefined。
   */
  private resolveWorkspaceStoragePath():
    | { workspaceStoragePath: string; workspaceId: string }
    | undefined {
    const storageUri = this.context.storageUri ?? this.context.globalStorageUri;
    if (!storageUri) {
      return undefined;
    }
    // fsPath 形如 "\\workspaceStorage\\<id>\\<extId>"；按 sep 拆开后从尾部回搾
    const parts = storageUri.fsPath.split(path.sep).filter((p) => p.length > 0);
    // 保证至少有 "…/workspaceStorage/<id>/<extId>" 三级
    const wsIdx = parts.findIndex((p) => p.toLowerCase() === "workspacestorage");
    if (wsIdx < 0 || wsIdx + 2 >= parts.length) {
      return undefined;
    }
    const workspaceId = parts[wsIdx + 1];
    const workspaceStoragePath = parts.slice(0, wsIdx + 1).join(path.sep);
    // Insiders / stable 的路径中“Code - Insiders” 与 "Code" 差异已被 storageUri 本身反映，无需重复处理
    return { workspaceStoragePath, workspaceId };
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
   * 主动刷新：重新扫描工作区并推送给指定 webview
   * 用于侧边栏刷新命令；面板入口可选调用
   * @param webview 接收推送的目标 webview
   */
  public async refresh(webview: vscode.Webview): Promise<void> {
    try {
      this.workspacesCache = undefined; // 强制刷新
      const workspaces = await this.scanWorkspacesCached();
      webview.postMessage({
        type: MessageTypes.ON_WORKSPACES_CHANGED,
        requestId: "",
        payload: { workspaces },
        error: null,
      });
    } catch (err) {
      console.error("[Memory Board] Refresh failed:", err);
    }
  }

  /**
   * 优先返回缓存；缓存未命中时根据 currentWorkspaceId 智能选择扫描范围：
   * - 仅有 currentWorkspaceId 时只扫当前工作区（较快）
   * - 用户主动请求全扫时调用 scanAllWorkspaces 并写入缓存
   */
  private async scanWorkspacesCached(forceAll = false): Promise<Workspace[]> {
    if (!this.parser) {
      return [];
    }
    if (this.workspacesCache && !forceAll) {
      return this.workspacesCache;
    }
    const workspaces = forceAll
      ? await this.parser.scanWorkspaces()
      : await this.parser.scanCurrentWorkspace();
    this.workspacesCache = workspaces;
    return workspaces;
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
        case MessageTypes.GET_WORKSPACES: {
          const workspaces = await this.scanWorkspacesCached();
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { workspaces },
            error: null,
          };
          break;
        }

        case MessageTypes.GET_SESSIONS_BY_WORKSPACE: {
          const { workspaceId } = message.payload as { workspaceId: string };
          const sessions = this.parser
            ? await this.parser.getSessionsByWorkspace(workspaceId)
            : [];
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
          // 从工作区状态或最新上下文传递时，需要 workspaceId 才能定位 repo特殊 session
          // 默认使用 currentWorkspaceId（这是 99% 的场景）
          const workspaceId =
            (message.payload as { workspaceId?: string }).workspaceId ??
            this.currentWorkspaceId;
          const entries = this.parser
            ? await this.parser.readMemoryContent(sessionId, workspaceId)
            : [];
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

        case MessageTypes.OPEN_FILE: {
          const { name, content, path: filePath } = message.payload as OpenFileRequest["payload"];
          // 在 VS Code 编辑器中打开对应的文件内容
          await this.openDocumentInVsCode(name, content, filePath);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: {},
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
      workspaceSort: { ...DEFAULT_WORKSPACE_STATE.workspaceSort },
      sessionSort: { ...DEFAULT_WORKSPACE_STATE.sessionSort },
      fileTreeSort: { ...DEFAULT_WORKSPACE_STATE.fileTreeSort },
      previewVisible: DEFAULT_WORKSPACE_STATE.previewVisible,
      pinnedWorkspaceIds: [...DEFAULT_WORKSPACE_STATE.pinnedWorkspaceIds],
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
      workspaceSort: patch.workspaceSort ?? base.workspaceSort,
      sessionSort: patch.sessionSort ?? base.sessionSort,
      fileTreeSort: patch.fileTreeSort ?? base.fileTreeSort,
      previewVisible: patch.previewVisible ?? base.previewVisible,
      pinnedWorkspaceIds: patch.pinnedWorkspaceIds ?? base.pinnedWorkspaceIds,
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

  /**
   * 在 VS Code 编辑器中打开并显示文件内容。
   * 如果提供了真实的物理文件路径且文件存在，则直接打开；
   * 否则创建一个包含初始内容的 Untitled 虚拟文本编辑器并在 VS Code 中展示。
   *
   * @param name 文件名（用于推断语法高亮的语言）
   * @param content 文件文本内容
   * @param filePath 物理文件绝对路径（如果有的话）
   */
  private async openDocumentInVsCode(
    name: string,
    content: string,
    filePath?: string
  ): Promise<void> {
    // 如果物理路径存在且对应文件在磁盘上确实存在，则直接打开物理文件
    if (filePath && fs.existsSync(filePath)) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc, { preview: true });
      return;
    }

    // 根据文件后缀推断 VS Code 的语言模式 (Language ID)
    const ext = path.extname(name).toLowerCase();
    let language: string | undefined;
    switch (ext) {
      case ".ts":
        language = "typescript";
        break;
      case ".tsx":
        language = "typescriptreact";
        break;
      case ".js":
        language = "javascript";
        break;
      case ".jsx":
        language = "javascriptreact";
        break;
      case ".json":
        language = "json";
        break;
      case ".md":
        language = "markdown";
        break;
      case ".css":
        language = "css";
        break;
      case ".html":
        language = "html";
        break;
      case ".txt":
        language = "plaintext";
        break;
      default:
        language = undefined;
    }

    // 创建 Untitled 类型的虚拟文本编辑器并打开
    const doc = await vscode.workspace.openTextDocument({
      content: content,
      language: language,
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }
}

/**
 * 多容器 Webview View 提供者。
 *
 * 继承自共享内核 {@link MemoryBoardWebviewCore}，在 `resolveWebviewView`
 * 被调用时复用 `attachWebview` 装配 GUI。该提供者可以同时处理多个物理视图 ID
 * （如主侧栏、辅助侧栏和面板栏的 View），内部维护所有被解析的 View 映射以保证多端同步刷新。
 */
export class MemoryBoardViewProvider extends MemoryBoardWebviewCore {
  // 保存所有已解析和激活的 WebviewView 实例映射，key 为其 viewType (即在 package.json 声明的 ID)
  private views = new Map<string, vscode.WebviewView>();

  /**
   * 当 Webview View 需要被解析时，由 VS Code 自动调用。
   * @param webviewView 待装配的 webview 视图实例
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    const viewId = webviewView.viewType;
    this.views.set(viewId, webviewView);

    // 复用共享的 HTML、CSP 与事件监听装配流程
    this.attachWebview(webviewView.webview);

    // 监听视图可见性变化
    webviewView.onDidChangeVisibility(() => {
      console.log(
        `[Memory Board] View ${viewId} visibility changed: ${webviewView.visible}`
      );
    },
    undefined,
    this.context.subscriptions);

    // 监听视图被销毁时的清理事件，在 Map 中移除对应实例引用
    webviewView.onDidDispose(() => {
      this.views.delete(viewId);
    },
    undefined,
    this.context.subscriptions);
  }

  /**
   * 刷新当前所有已激活的视图。若传入了特定 webview 则只刷新该实例。
   * @param webview 可选的特定刷新目标 webview
   */
  public override async refresh(webview?: vscode.Webview): Promise<void> {
    if (webview) {
      await super.refresh(webview);
      return;
    }
    // 并发刷新所有正在活跃的 Webview 实例
    const promises = Array.from(this.views.values()).map((v) =>
      super.refresh(v.webview)
    );
    await Promise.all(promises);
  }
}

/**
 * 独立 WebviewPanel 管理者。
 *
 * 通过命令 `memoryBoard.moveToEditor` / `memoryBoard.openInPanel` 调用 {@link open}，
 * 在编辑器区域打开一个独立的 WebviewPanel。配合 extension.ts 中的 setContext，
 * 实现“迁移到编辑器”语义：面板打开时侧边栏视图隐藏，面板关闭时视图恢复。
 * 当前实现采用单实例策略：再次调用命令会复用已存在的 panel。
 */
export class MemoryBoardPanelManager extends MemoryBoardWebviewCore {
  public static readonly viewType = "memoryBoard.panelView";

  private panel?: vscode.WebviewPanel;

  constructor(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    super(extensionUri, context);
  }

  /**
   * 打开（或聚焦）独立的 Memory Board 面板。
   * 已存在则直接 reveal；不存在则新建并装配 GUI。
   */
  public open(): Promise<void> {
    // 单实例复用：已存在时直接聚焦，避免多窗口同时写 workspaceState 状态歧义
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active, false);
      return Promise.resolve();
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

    // 面板关闭时：清理引用并恢复侧边栏视图（迁移回侧边栏）
    panel.onDidDispose(
      () => {
        this.panel = undefined;
        // 把 activeLocation 置回 sidebar，并同步更新工作区持久状态，使侧边栏视图重新可见
        vscode.commands
          .executeCommand("setContext", "memoryBoard.activeLocation", "sidebar")
          .then(undefined, (err) =>
            console.warn(
              "[Memory Board] 恢复侧边栏视图的 setContext 调用失败:",
              err
            )
          );
        void this.context.workspaceState.update("memoryBoard.activeLocation", "sidebar");
      },
      undefined,
      this.context.subscriptions
    );

    return Promise.resolve();
  }

  /**
   * 面板刷新命令入口：如果面板已打开，重新扫描并推送仓库数据
   */
  public async refresh(): Promise<void> {
    if (this.panel) {
      await super.refresh(this.panel.webview);
    }
  }

  /**
   * 关闭当前面板（若已打开）。
   * 用于"移动到主侧栏"命令：关闭后 onDidDispose 会自动恢复 memoryBoard.movedToPanel=false，
   * 使侧边栏视图重新可见。调用方随后可执行 workbench.view.memory-board-sidebar 等命令聚焦侧边栏。
   */
  public close(): void {
    if (this.panel) {
      this.panel.dispose();
      // dispose 会触发 onDidDispose，负责清理 panel 引用与 setContext
    }
  }

  /**
   * 当前是否有面板处于打开状态（用于命令的 enablement 判断）
   */
  public isOpen(): boolean {
    return !!this.panel;
  }
}
