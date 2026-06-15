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
  CopyEntriesRequest,
  MoveEntriesRequest,
  RenameEntryRequest,
  DeleteEntriesRequest,
  CreateDirectoryRequest,
  ImportExternalFileRequest,
  RevealInOsRequest,
  CopyPathToClipboardRequest,
  ResponseMessage,
  UiPreferences,
  Workspace,
  WorkspaceState,
} from "@memory-board/core";
// 创建专属的输出通道，使得在宿主 IDE 的“输出”下拉框中可以找到 Memory Board 的日志
export const outputChannel = vscode.window.createOutputChannel("Memory Board");

import { readClipboardFilePaths } from "./clipboard-files";

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
  private currentWorkspaceId: string | undefined;

  /**
   * workspaceStorage 根目录的绝对路径。
   * 形如 Windows: C:/Users/xxx/AppData/Roaming/Code/User/workspaceStorage
   *       Insiders:  C:/Users/xxx/AppData/Roaming/Code - Insiders/User/workspaceStorage
   */
  private workspaceStoragePath: string | undefined;

  /**
   * 是否展示重定向选择器（当前运行在非官方 VS Code 环境下时展示）
   */
  private showRedirectSelector: boolean = false;

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
    this.showRedirectSelector = resolved?.showRedirectSelector ?? false;

    if (this.workspaceStoragePath && this.currentWorkspaceId) {
      // 优先读 dev/test 环境变量覆盖（e2e 注入 tmpdir mock 时使用）
      const override = process.env["MEMORY_BOARD_WS_STORAGE_OVERRIDE"];
      const basePath = (override && override.trim().length > 0) ? override : this.workspaceStoragePath;
      this.parser = new MemoryParser({
        basePath,
        currentWorkspaceId: this.currentWorkspaceId,
        filterRemoteWorkspaces: vscode.env.remoteName === undefined,
      });
      console.log(
        `[Memory Board] MemoryParser initialized: workspaceId=${this.currentWorkspaceId}, basePath=${basePath}, filterRemoteWorkspaces=${vscode.env.remoteName === undefined}`,
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
  /**
   * 从 context.storageUri 反推 workspaceStorage 根路径与当前 workspaceId，并判断是否需要重定向。
   * 添加了中文注释以解释其作用及复杂逻辑。
   */
  private resolveWorkspaceStoragePath():
    | { workspaceStoragePath: string; workspaceId: string; showRedirectSelector: boolean }
    | undefined {
    const storageUri = this.context.storageUri ?? this.context.globalStorageUri;
    if (!storageUri) {
      return undefined;
    }
    // fsPath 形如 "\\workspaceStorage\\<id>\\<extId>"；按 sep 拆开后从尾部解析
    const parts = storageUri.fsPath.split(path.sep).filter((p) => p.length > 0);
    // 保证至少有 "…/workspaceStorage/<id>/<extId>" 三级
    const wsIdx = parts.findIndex((p) => p.toLowerCase() === "workspacestorage");
    if (wsIdx < 0 || wsIdx + 2 >= parts.length) {
      return undefined;
    }
    const workspaceId = parts[wsIdx + 1];
    if (!workspaceId) {
      // parts[wsIdx + 1] 在数组尾后访问会返回 undefined；这里提前返回避免类型缩窄问题
      return undefined;
    }
    
    // 计算原始的 workspaceStoragePath，修复 macOS/Linux 下绝对路径丢失开头分隔符的潜在问题
    let workspaceStoragePath = parts.slice(0, wsIdx + 1).join(path.sep);
    if (storageUri.fsPath.startsWith(path.sep)) {
      workspaceStoragePath = path.sep + workspaceStoragePath;
    }

    // 默认的 workspaceStoragePath
    let finalWorkspaceStoragePath = workspaceStoragePath;

    // 输出详细的诊断日志至专属的 Output Channel (Memory Board) 管道，以便在 IDE 的输出面板下拉菜单中直接查看
    outputChannel.appendLine(`[Memory Board Diagnostics] storageUri.fsPath: ${storageUri.fsPath}`);
    outputChannel.appendLine(`[Memory Board Diagnostics] Calculated workspaceStoragePath: ${workspaceStoragePath}`);
    outputChannel.appendLine(`[Memory Board Diagnostics] Calculated workspaceId: ${workspaceId}`);

    // 获取当前运行 IDE 的目录名称（如 "Code"、"Code - Insiders"、"Antigravity IDE" 等）
    const currentAppName = wsIdx >= 2 ? parts[wsIdx - 2] : "";

    // 判定当前是否为官方 VS Code（稳定版或体验版）
    const isOfficialVSCode = (() => {
      if (!currentAppName) {
        return true; // 无法提取到应用名时，默认不展示重定向选择器
      }
      const appNameLower = currentAppName.toLowerCase();
      // 官方常见文件夹名为 "code"、"code - insiders"、"code-insiders" (包括大小写变体)
      if (
        appNameLower === "code" ||
        appNameLower === "code - insiders" ||
        appNameLower === "code-insiders"
      ) {
        return true;
      }

      // 同时结合 vscode.env 提供的环境变量进行辅助判定
      const envAppName = vscode.env.appName ? vscode.env.appName.toLowerCase() : "";
      const envUriScheme = vscode.env.uriScheme ? vscode.env.uriScheme.toLowerCase() : "";
      if (
        envAppName === "visual studio code" ||
        envAppName === "visual studio code - insiders" ||
        envAppName === "visual studio code – insiders"
      ) {
        return true;
      }
      if (envUriScheme === "code" || envUriScheme === "code-insiders") {
        return true;
      }

      return false;
    })();

    // 只有在非 VS Code 官方版本（即第三方 IDE）下，才展示重定向切换下拉按钮
    const showRedirectSelector = !isOfficialVSCode;

    // 读取全局偏好，决定重定向的目标（stable / insiders / none）
    const prefs = this.readUiPreferences();
    const redirectTarget = prefs.ideRedirectTarget ?? "stable";

    // 针对第三方 IDE 的重定向逻辑：
    // 若当前环境是非官方 VS Code（如 Antigravity IDE），且启用了重定向目标，
    // 则将 AppData/Roaming 中的 IDE 目录名称动态替换为官方 VS Code 对应目录名。
    if (showRedirectSelector && redirectTarget !== "none" && currentAppName) {
      const targetDirName = redirectTarget === "insiders" ? "Code - Insiders" : "Code";
      const redirectedParts = [...parts];
      redirectedParts[wsIdx - 2] = targetDirName;
      
      let codePath = redirectedParts.slice(0, wsIdx + 1).join(path.sep);
      if (storageUri.fsPath.startsWith(path.sep)) {
        codePath = path.sep + codePath;
      }

      if (fs.existsSync(codePath)) {
        finalWorkspaceStoragePath = codePath;
        outputChannel.appendLine(
          `[Memory Board] Detect third-party IDE (${currentAppName}), redirecting workspaceStoragePath to VS Code (${redirectTarget}): ${finalWorkspaceStoragePath}`
        );
      } else {
        outputChannel.appendLine(
          `[Memory Board] VS Code storage directory not found at: ${codePath}. Keep original path.`
        );
      }
    }

    // Insiders / stable 的路径中“Code - Insiders” 与 "Code" 差异已被 storageUri 本身反映，无需重复处理
    return { workspaceStoragePath: finalWorkspaceStoragePath, workspaceId, showRedirectSelector };
  }

  /**
   * 重新初始化 Parser 实例。用于当用户在前端切换了 IDE 重定向选项后动态刷新数据。
   */
  private reinitParser(): void {
    const resolved = this.resolveWorkspaceStoragePath();
    this.workspaceStoragePath = resolved?.workspaceStoragePath;
    this.currentWorkspaceId = resolved?.workspaceId;
    this.showRedirectSelector = resolved?.showRedirectSelector ?? false;

    if (this.workspaceStoragePath && this.currentWorkspaceId) {
      const override = process.env["MEMORY_BOARD_WS_STORAGE_OVERRIDE"];
      const basePath = (override && override.trim().length > 0) ? override : this.workspaceStoragePath;
      this.parser = new MemoryParser({
        basePath,
        currentWorkspaceId: this.currentWorkspaceId,
        filterRemoteWorkspaces: vscode.env.remoteName === undefined,
      });
      outputChannel.appendLine(
        `[Memory Board] MemoryParser reinitialized: workspaceId=${this.currentWorkspaceId}, basePath=${basePath}, filterRemoteWorkspaces=${vscode.env.remoteName === undefined}`
      );
    } else {
      this.parser = undefined;
      outputChannel.appendLine("[Memory Board] MemoryParser disabled (storage path unavailable).");
    }
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
      const workspaces = await this.scanWorkspacesCached(true);
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
   * 优先返回缓存；缓存未命中时扫描 workspaceStorage 下**全部**子目录。
   *
   * 设计决策（2026-06）：默认全扫。原因：
   * - “只显示一个工作区” 是用户而言的反直觉表现（他们在多个项目里用过 Copilot Memory）；
   * - scanWorkspaces() 本身已能过滤掉“没有 memories 目录” 的 workspaceId，性能可接受；
   * - currentWorkspaceId 仍会在 getCurrentWorkspace 协议中作为“默认选中项” 返回。
   *
   * @param forceRefresh 强制清空缓存后重新扫描（由 refresh 命令调用时传 true）
   */
  private async scanWorkspacesCached(forceRefresh = false): Promise<Workspace[]> {
    if (!this.parser) {
      return [];
    }
    if (this.workspacesCache && !forceRefresh) {
      return this.workspacesCache;
    }
    // 全部扫描，覆盖所有 workspaceStorage/<hex32> 子目录
    const workspaces = await this.parser.scanWorkspaces();
    const repaired = await this.repairWorkspacesForRemote(workspaces);
    this.workspacesCache = repaired;
    return repaired;
  }

  /**
   * 在 WSL/远程环境下修复并丰富 Workspace 列表。
   * 同时将所有解析出的属性输出到专用日志通道以便调试。
   */
  private async repairWorkspacesForRemote(workspaces: Workspace[]): Promise<Workspace[]> {
    const isRemote = vscode.env.remoteName !== undefined;
    const folders = vscode.workspace.workspaceFolders;

    outputChannel.appendLine(`[Memory Board] Repairing workspaces: isRemote=${isRemote}, foldersCount=${folders?.length ?? 0}`);

    // 获取 Windows 端的 AppData/Roaming 路径（仅在 WSL/远程环境下尝试）
    let winWorkspaceStorageDirs: string[] = [];
    if (isRemote) {
      const winAppData = this.getWindowsAppDataRoamingInWsl();
      if (winAppData) {
        outputChannel.appendLine(`[Memory Board] Detected Windows AppData: ${winAppData}`);
        // 检查可能存在的 VS Code 存储目录
        for (const appName of ["Code", "Code - Insiders"]) {
          const wsPath = path.join(winAppData, appName, "User", "workspaceStorage");
          if (fs.existsSync(wsPath)) {
            winWorkspaceStorageDirs.push(wsPath);
            outputChannel.appendLine(`[Memory Board] Added Windows workspaceStorage search path: ${wsPath}`);
          }
        }
      } else {
        outputChannel.appendLine(`[Memory Board] Could not auto-detect Windows AppData in WSL.`);
      }
    }

    const repairedWorkspaces: Workspace[] = [];

    for (const ws of workspaces) {
      let repairedName = ws.name;
      let repairedPath = ws.path;

      // 1. 如果是当前正在打开的工作区，优先使用 vscode.workspace.workspaceFolders 里的信息
      const firstFolder = folders && folders[0];
      if (this.currentWorkspaceId && ws.id === this.currentWorkspaceId && firstFolder) {
        repairedName = firstFolder.name;
        repairedPath = firstFolder.uri.fsPath;
        outputChannel.appendLine(`[Memory Board] Repaired current workspace ${ws.id} using active WorkspaceFolder: name=${repairedName}, path=${repairedPath}`);
      } else if (isRemote && winWorkspaceStorageDirs.length > 0) {
        // 2. 对于 WSL/远程环境下的其他历史工作区，尝试从 Windows 端的 workspace.json 中读取配置
        let readSuccessful = false;
        for (const winWsStorage of winWorkspaceStorageDirs) {
          const winJsonPath = path.join(winWsStorage, ws.id, "workspace.json");
          if (fs.existsSync(winJsonPath)) {
            try {
              const raw = fs.readFileSync(winJsonPath, "utf8");
              const obj = JSON.parse(raw) as { folder?: string; workspace?: string };
              const folderUri = obj.folder ?? obj.workspace;
              if (folderUri) {
                // 如果是 vscode-remote 协议，解析出真实路径
                if (folderUri.startsWith("vscode-remote:")) {
                  const url = new URL(folderUri);
                  const decodedPath = decodeURIComponent(url.pathname);
                  repairedPath = decodedPath;
                  repairedName = path.basename(decodedPath);
                } else if (folderUri.startsWith("file:")) {
                  // 如果是本地 file: 协议且以 Windows 路径为主，尝试将其转换为 WSL 挂载路径
                  const winPath = this.uriToFsPathLocal(folderUri);
                  repairedPath = this.winPathToWsl(winPath);
                  repairedName = path.basename(repairedPath) || winPath;
                }
                readSuccessful = true;
                outputChannel.appendLine(`[Memory Board] Resolved historical workspace ${ws.id} from Windows workspace.json: name=${repairedName}, path=${repairedPath}`);
                break;
              }
            } catch (err) {
              outputChannel.appendLine(`[Memory Board] Error reading Windows workspace.json for ${ws.id}: ${err}`);
            }
          }
        }

        // 3. 如果在 Windows 端也读不到，则直接降级使用 workspaceId 作为 name/path
        if (!readSuccessful && (!repairedPath || repairedPath === ws.id)) {
          repairedName = ws.id;
          repairedPath = ws.id;
          outputChannel.appendLine(`[Memory Board] Fallback historical workspace ${ws.id} to workspaceId`);
        }
      }

      // 如果 repairedPath 是 Windows 路径，且我们在 WSL/远程环境，执行挂载路径转换
      if (isRemote && repairedPath && /^[a-zA-Z]:\\/.test(repairedPath)) {
        repairedPath = this.winPathToWsl(repairedPath);
      }

      const repairedWs = {
        ...ws,
        name: repairedName || ws.id,
        path: repairedPath || "",
      };

      // 诊断日志输出到专用输出通道
      outputChannel.appendLine(`[Memory Board Workspace Info] id: ${repairedWs.id}, name: ${repairedWs.name}, path: ${repairedWs.path}, sessions: ${repairedWs.sessionCount}`);
      repairedWorkspaces.push(repairedWs);
    }

    return repairedWorkspaces;
  }

  /**
   * 自动探测 WSL 中挂载的 Windows AppData Roaming 路径
   */
  private getWindowsAppDataRoamingInWsl(): string | undefined {
    const pathParts = (process.env.PATH ?? "").split(path.delimiter);
    for (const part of pathParts) {
      // 匹配包含 Users 的 Windows 路径在 WSL 中的挂载路径
      const match = part.match(/^(\/[^/]+\/[^/]+\/Users\/[^/]+)/);
      if (match && match[1]) {
        const winUserHome = match[1];
        const appDataPath = path.join(winUserHome, "AppData", "Roaming");
        if (fs.existsSync(appDataPath)) {
          return appDataPath;
        }
      }
    }

    // 备用方案：扫描 /mnt/c/Users/ 下的用户目录
    const mounts = ["/mnt/c/Users", "/c/Users"];
    for (const mount of mounts) {
      if (fs.existsSync(mount)) {
        try {
          const users = fs.readdirSync(mount);
          for (const user of users) {
            if (["default", "public", "all users", "desktop.ini"].includes(user.toLowerCase())) {
              continue;
            }
            const appDataPath = path.join(mount, user, "AppData", "Roaming");
            if (fs.existsSync(appDataPath)) {
              return appDataPath;
            }
          }
        } catch {
          // 忽略读取错误
        }
      }
    }
    return undefined;
  }

  /**
   * 转换 Windows 路径为 WSL 挂载路径
   */
  private winPathToWsl(winPath: string): string {
    const match = winPath.match(/^([a-zA-Z]):\\(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      const drive = match[1].toLowerCase();
      const rest = match[2].replace(/\\/g, "/");
      return `/mnt/${drive}/${rest}`;
    }
    return winPath;
  }

  /**
   * 从 file URI 解码出本地 file 路径
   */
  private uriToFsPathLocal(uriStr: string): string {
    if (!uriStr.startsWith("file:")) {
      return "";
    }
    try {
      const parsed = new URL(uriStr);
      const pathname = decodeURIComponent(parsed.pathname);
      const isWinDrive = /^\/[a-zA-Z]:/.test(pathname);
      const fsPath = isWinDrive ? pathname.slice(1) : pathname;
      return fsPath.replace(/\//g, path.sep);
    } catch {
      return "";
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
            payload: {
              preferences: prefs,
              showRedirectSelector: this.showRedirectSelector,
              isAgy: this.showRedirectSelector, // 兼容旧版 isAgy 命名
              // 注入扩展端当前显示语言（如 "zh-cn"/"en"），供 webview 端 i18n 选用翻译资源。
              // VS Code 切换 Display Language 必然重启窗口（没有运行时事件），webview 也随之重建，
              // 因此无需 push 推送，webview 启动读取一次即可。
              language: vscode.env.language,
            },
            error: null,
          };
          break;
        }

        case MessageTypes.SET_UI_PREFERENCES: {
          const { preferences: patch } = message.payload as {
            preferences: Partial<UiPreferences>;
          };
          const next = this.writeUiPreferences(patch);

          // 若修改了重定向 IDE 目标偏好，则重新解析工作区存储路径并重新扫描刷新
          if (patch.ideRedirectTarget !== undefined) {
            this.reinitParser();
            await this.refresh(webview);
          }

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

        case MessageTypes.GET_CURRENT_WORKSPACE: {
          // 默认进入当前 workspace（仅 VS Code 模式有此概念；standalone 不支持时 workspace 为 undefined）
          // 需要扫描后从缓存里查找 currentWorkspaceId 对应的 Workspace 对象
          const all = await this.scanWorkspacesCached();
          const currentWs = this.currentWorkspaceId
            ? all.find((w) => w.id === this.currentWorkspaceId) ?? undefined
            : undefined;
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { workspace: currentWs },
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

        // ---------------------------------------------------------------
        // 文件操作协议：复制/移动/重命名/删除/创建目录/导入/系统显示/路径复制/外部剪贴板
        // ---------------------------------------------------------------

        case MessageTypes.COPY_ENTRIES: {
          const { sourcePaths, targetDir } = message.payload as CopyEntriesRequest["payload"];
          await this.copyEntries(sourcePaths, targetDir, webview);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: {},
            error: null,
          };
          break;
        }

        case MessageTypes.MOVE_ENTRIES: {
          const { sourcePaths, targetDir } = message.payload as MoveEntriesRequest["payload"];
          await this.moveEntries(sourcePaths, targetDir, webview);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: {},
            error: null,
          };
          break;
        }

        case MessageTypes.RENAME_ENTRY: {
          const { path: entryPath, newName } = message.payload as RenameEntryRequest["payload"];
          await this.renameEntry(entryPath, newName, webview);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: {},
            error: null,
          };
          break;
        }

        case MessageTypes.DELETE_ENTRIES: {
          const { paths, useTrash } = message.payload as DeleteEntriesRequest["payload"];
          await this.deleteEntries(paths, useTrash, webview);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: {},
            error: null,
          };
          break;
        }

        case MessageTypes.CREATE_DIRECTORY: {
          const { path: dirPath } = message.payload as CreateDirectoryRequest["payload"];
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
          await this.refresh(webview);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: {},
            error: null,
          };
          break;
        }

        case MessageTypes.IMPORT_EXTERNAL_FILE: {
          const { targetDir, name, contentBase64, sizeBytes } =
            message.payload as ImportExternalFileRequest["payload"];
          await this.importExternalFile(targetDir, name, contentBase64, sizeBytes, webview);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: {},
            error: null,
          };
          break;
        }

        case MessageTypes.REVEAL_IN_OS: {
          const { path: revealPath } = message.payload as RevealInOsRequest["payload"];
          // 如果 revealPath 是目录，且该目录下存在 workspace.json，为了在 OS 资源管理器中能够直接进入当前目录，
          // 我们将定位目标指向 workspace.json，让系统资源管理器打开此工作区文件夹并高亮该文件。
          let targetPath = revealPath;
          try {
            const stat = fs.statSync(revealPath);
            if (stat.isDirectory()) {
              const wsJson = path.join(revealPath, "workspace.json");
              if (fs.existsSync(wsJson)) {
                targetPath = wsJson;
              }
            }
          } catch {
            // 忽略异常，保持原路径
          }
          // 使用 VS Code 内置命令在系统资源管理器中显示文件
          await vscode.commands.executeCommand(
            "revealFileInOS",
            vscode.Uri.file(targetPath)
          );
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: {},
            error: null,
          };
          break;
        }

        case MessageTypes.COPY_PATH_TO_CLIPBOARD: {
          const { path: copyPath, relative, workspaceId } =
            message.payload as CopyPathToClipboardRequest["payload"];
          await this.copyPathToClipboard(copyPath, relative, workspaceId);
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: {},
            error: null,
          };
          break;
        }

        case MessageTypes.READ_EXTERNAL_CLIPBOARD_FILES: {
          // 读取系统剪贴板中的文件列表（仅 Windows 支持）
          const result = await readClipboardFilePaths();
          response = {
            type: message.type,
            requestId: message.requestId,
            payload: { paths: result.paths, unsupported: result.unsupported },
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
      // 仅展示有记忆的工作区状态（v0.0.2 新增；必须在此补齐，否则 VS Code 模式下会被合并函数丢失）
      onlyShowWithMemories: DEFAULT_WORKSPACE_STATE.onlyShowWithMemories,
      // 仅展示有条目的会话状态（同上）
      onlyShowWithEntries: DEFAULT_WORKSPACE_STATE.onlyShowWithEntries,
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
      // 仅展示有记忆的工作区（v0.0.2 新增；漏写此处会导致 webview 写入的状态在 VS Code 模式下被悄悄回退到默认值 false）
      onlyShowWithMemories: patch.onlyShowWithMemories ?? base.onlyShowWithMemories,
      // 仅展示有条目的会话（同上）
      onlyShowWithEntries: patch.onlyShowWithEntries ?? base.onlyShowWithEntries,
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
   *
   * 行为约定（2026-06 调整）：
   * - 若 `filePath` 为空 / undefined：弹错误提示「Memory 文件未指定路径」但不打开任何文件。
   * - 若 `filePath` 在磁盘上不存在：弹 `Memory 文件不存在：<path>`，**不再兜底创建 Untitled 文档**。
   * - 若 `filePath` 存在：用 `openTextDocument(Uri.file(path))` 打开物理文件，并 `showTextDocument`。
   *
   * @param name 文件名（用于错误提示）
   * @param _content 文件文本内容（保留参数以兼容协议，已不再用于 Untitled 兜底）
   * @param filePath 物理文件绝对路径
   */
  private async openDocumentInVsCode(
    name: string,
    _content: string,
    filePath?: string
  ): Promise<void> {
    // 没有提供路径：不打开文件，仅提示
    if (!filePath || filePath.trim().length === 0) {
      await vscode.window.showErrorMessage(
        `Memory 文件未指定路径：${name}`,
      );
      return;
    }

    // 物理路径在磁盘上不存在：提示错误，不创建 Untitled
    if (!fs.existsSync(filePath)) {
      await vscode.window.showErrorMessage(
        `Memory 文件不存在：${filePath}`,
      );
      return;
    }

    // 路径存在：打开真实的物理文件。设置 preserveFocus: true，从而使焦点依然保留在 Webview (Memory Board) 内部，保证复制粘贴等快捷键继续有效
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  }

  // ---------------------------------------------------------------------------
  // 文件操作辅助方法
  // ---------------------------------------------------------------------------

  /** 外部导入文件大小上限：30MB */
  private static readonly MAX_IMPORT_SIZE = 30 * 1024 * 1024;

  /**
   * 复制文件/目录到目标文件夹。
   * 使用 vscode.workspace.fs.copy 逐一复制源路径到目标目录下。
   * 若目标已存在同名文件，自动添加 " - Copy" 后缀避免覆盖。
   *
   * @param sourcePaths 源文件/目录的绝对路径列表
   * @param targetDir 目标文件夹的绝对路径
   * @param webview 操作完成后需要推送刷新的 webview
   */
  private async copyEntries(
    sourcePaths: string[],
    targetDir: string,
    webview: vscode.Webview
  ): Promise<void> {
    for (const src of sourcePaths) {
      const baseName = path.basename(src);
      let targetPath = path.join(targetDir, baseName);
      // 同名文件自动加后缀避免覆盖
      targetPath = await this.ensureUniquePath(targetPath);
      await vscode.workspace.fs.copy(
        vscode.Uri.file(src),
        vscode.Uri.file(targetPath),
        { overwrite: false }
      );
    }
    await this.refresh(webview);
  }

  /**
   * 移动文件/目录到目标文件夹。
   * 使用 vscode.workspace.fs.rename 实现移动。
   * 包含循环移动检测：targetDir 不能在 sourcePath 子树下。
   *
   * @param sourcePaths 源文件/目录的绝对路径列表
   * @param targetDir 目标文件夹的绝对路径
   * @param webview 操作完成后需要推送刷新的 webview
   */
  private async moveEntries(
    sourcePaths: string[],
    targetDir: string,
    webview: vscode.Webview
  ): Promise<void> {
    for (const src of sourcePaths) {
      // 循环移动检测：不能把父目录移到自己的子目录下
      const rel = path.relative(src, targetDir);
      if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
        throw new Error(`不能将文件夹移动到其自身子目录下：${path.basename(src)} → ${targetDir}`);
      }
      const baseName = path.basename(src);
      let targetPath = path.join(targetDir, baseName);
      targetPath = await this.ensureUniquePath(targetPath);
      await vscode.workspace.fs.rename(
        vscode.Uri.file(src),
        vscode.Uri.file(targetPath),
        { overwrite: false }
      );
    }
    await this.refresh(webview);
  }

  /**
   * 重命名文件/目录（仅同目录改名）。
   *
   * @param entryPath 文件/目录的绝对路径
   * @param newName 新名称（不含路径分隔符）
   * @param webview 操作完成后需要推送刷新的 webview
   */
  private async renameEntry(
    entryPath: string,
    newName: string,
    webview: vscode.Webview
  ): Promise<void> {
    const dir = path.dirname(entryPath);
    const newPath = path.join(dir, newName);
    await vscode.workspace.fs.rename(
      vscode.Uri.file(entryPath),
      vscode.Uri.file(newPath),
      { overwrite: false }
    );
    await this.refresh(webview);
  }

  /**
   * 删除文件/目录。默认使用系统回收站（useTrash: true）。
   *
   * @param paths 要删除的文件/目录绝对路径列表
   * @param useTrash 是否使用系统回收站
   * @param webview 操作完成后需要推送刷新的 webview
   */
  private async deleteEntries(
    paths: string[],
    useTrash: boolean,
    webview: vscode.Webview
  ): Promise<void> {
    for (const p of paths) {
      await vscode.workspace.fs.delete(vscode.Uri.file(p), {
        recursive: true,
        useTrash,
      });
    }
    await this.refresh(webview);
  }

  /**
   * 导入外部文件：将 base64 编码的文件内容写入目标目录。
   * 双重校验文件大小上限（30MB），GUI 端和扩展端各校验一次。
   *
   * @param targetDir 目标目录绝对路径
   * @param name 文件名
   * @param contentBase64 文件内容的 base64 编码
   * @param sizeBytes 文件原始大小（字节），用于二次校验
   * @param webview 操作完成后需要推送刷新的 webview
   */
  private async importExternalFile(
    targetDir: string,
    name: string,
    contentBase64: string,
    sizeBytes: number,
    webview: vscode.Webview
  ): Promise<void> {
    // 二次校验文件大小上限
    if (sizeBytes > MemoryBoardWebviewCore.MAX_IMPORT_SIZE) {
      throw new Error(
        `文件过大（${(sizeBytes / 1024 / 1024).toFixed(1)}MB），上限 30MB：${name}`
      );
    }
    const content = Buffer.from(contentBase64, "base64");
    let targetPath = path.join(targetDir, name);
    targetPath = await this.ensureUniquePath(targetPath);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(targetPath),
      new Uint8Array(content)
    );
    await this.refresh(webview);
  }

  /**
   * 复制文件路径到系统剪贴板。
   * 支持绝对路径和相对路径（相对于 workspaceStorage 根目录）模式。
   *
   * @param filePath 文件的绝对路径
   * @param relative 是否为相对路径模式
   * @param workspaceId 工作区 ID（计算相对路径时使用）
   */
  private async copyPathToClipboard(
    filePath: string,
    relative: boolean,
    workspaceId?: string
  ): Promise<void> {
    let textToCopy = filePath;
    // 如果复制的路径是目录，且该目录下存在 workspace.json，则将路径指向 workspace.json，以与在资源管理器中打开的行为一致
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const wsJson = path.join(filePath, "workspace.json");
        if (fs.existsSync(wsJson)) {
          textToCopy = wsJson;
        }
      }
    } catch {
      // 忽略异常，保持原路径
    }

    if (relative && workspaceId && this.workspaceStoragePath) {
      // 计算相对于 workspaceStorage/<workspaceId> 的路径
      const wsRoot = path.join(this.workspaceStoragePath, workspaceId);
      const rel = path.relative(wsRoot, textToCopy);
      textToCopy = rel;
    }
    await vscode.env.clipboard.writeText(textToCopy);
  }

  /**
   * 确保文件路径唯一：若同名文件已存在，则自动追加 " - Copy" / " - Copy 2" 等后缀。
   * 这样避免 overwrite: false 时抛异常，提供更友好的用户体验。
   *
   * @param targetPath 期望的目标路径
   * @returns 保证唯一的目标路径
   */
  private async ensureUniquePath(targetPath: string): Promise<string> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
    } catch {
      // 文件不存在，直接使用原路径
      return targetPath;
    }
    // 文件已存在，追加后缀
    const dir = path.dirname(targetPath);
    const ext = path.extname(targetPath);
    const baseName = path.basename(targetPath, ext);
    let counter = 1;
    let candidate: string;
    do {
      const suffix = counter === 1 ? " - Copy" : ` - Copy ${counter}`;
      candidate = path.join(dir, `${baseName}${suffix}${ext}`);
      counter++;
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
      } catch {
        return candidate;
      }
    } while (counter < 100); // 安全上限
    return candidate;
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
