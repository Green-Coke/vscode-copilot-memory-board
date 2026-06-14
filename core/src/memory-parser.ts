// ============================================================================
// @memory-board/core — MemoryParser
// ============================================================================
// 负责扫描本地 Copilot Chat 写入到 workspaceStorage 下的 memory 文件，
// 解析 workspace / session / memory entry 三层结构并组装成协议层类型。
//
// 关键路径映射（细节见 /memories/repo/copilot-memory-discovery.md）：
//   workspaceStorage/<workspaceId>/                                  → Workspace
//     workspace.json                                                 → folder URI → 真实路径 + name
//     GitHub.copilot-chat/memory-tool/memories/                      → 存在性判断
//       repo/  (固定名称)                                            → Session(id=REPO, isRepo=true)
//       <base64-编码的 sessionId>/  (与 chatSessions/*.jsonl 同源)   → Session
//         *.md                                                       → MemoryEntry
//   chatSessions/<sessionId>.jsonl                                   → Session.title + createdAt
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import type { MemoryEntry, Session, Workspace } from "./types.js";
import { DEFAULT_SESSION_IDS } from "./types.js";
import { parseChatSessionJsonl } from "./session-jsonl-parser.js";

/**
 * MemoryParser 的构造选项。
 *
 * - basePath: workspaceStorage 根目录的绝对路径（例如 `…/User/workspaceStorage`）
 * - currentWorkspaceId: 当前激活工作区的 workspaceId（可选）；用于仅扫描本地数据时限定
 * - metadataBasePath: chatSessions 目录的根路径（可选）；默认与 basePath 同级
 */
export interface MemoryParserOptions {
  /** workspaceStorage 根目录（包含若干 workspaceId 子目录） */
  basePath: string;
  /** 当前激活工作区的 workspaceId（用于仅扫描本地数据时限定到单个目录） */
  currentWorkspaceId?: string;
  /**
   * chatSessions 根目录（默认同 basePath，即默认 chatSessions 与 memories 同根）。
   * 若用户配置了自定义存放路径，可单独指定。
   */
  metadataBasePath?: string;
}

/**
 * Copilot Chat memory 文件解析器。
 *
 * 该类不依赖任何 VS Code / Electron API，是纯 Node.js 模块，
 * 便于在 vitest 单元测试中用 tmpdir 任意构造假数据验证。
 */
export class MemoryParser {
  /** workspaceStorage 根目录 */
  private basePath: string;
  /** 当前激活工作区 ID（可选） */
  private readonly currentWorkspaceId: string | undefined;
  /** chatSessions 根目录（用于读取 session 元数据） */
  private metadataBasePath: string;

  constructor(opts: MemoryParserOptions | string) {
    // 兼容旧版直接传 basePath 字符串的写法
    if (typeof opts === "string") {
      opts = { basePath: opts };
    }
    this.basePath = opts.basePath;
    this.currentWorkspaceId = opts.currentWorkspaceId;
    this.metadataBasePath = opts.metadataBasePath ?? opts.basePath;
  }

  /**
   * 更新或重新设置 workspaceStorage 根目录。
   * 调用此方法后所有缓存假设失效，下次读取会重新扫描磁盘。
   */
  setBasePath(basePath: string): void {
    this.basePath = basePath;
  }

  /**
   * 仅扫描当前激活的 workspace（currentWorkspaceId 指定的那个）。
   *
   * @returns 单个 Workspace 数组（可能为空）；若 currentWorkspaceId 未设置则返回空数组
   */
  async scanCurrentWorkspace(): Promise<Workspace[]> {
    if (!this.currentWorkspaceId) {
      return [];
    }
    const ws = await this.tryBuildWorkspace(this.currentWorkspaceId);
    return ws ? [ws] : [];
  }

  /**
   * 扫描 basePath 下所有 workspaceStorage 子目录，返回有效的 Workspace 列表。
   *
   * "有效"的定义：该 workspaceId 目录下存在 GitHub.copilot-chat/memory-tool/memories 目录。
   * 没有 memories 目录的 workspace（例如从未在该工作区使用过 Copilot）会被忽略。
   *
   * @returns Workspace 数组（可能是空）
   */
  async scanWorkspaces(): Promise<Workspace[]> {
    const entries = await this.safeReadDir(this.basePath);
    const workspaces: Workspace[] = [];

    for (const entry of entries) {
      if (entry.type !== "directory") {
        continue;
      }
      // workspaceId 是 32 位 hex（MD5）。允许 32 位长度，但这里做一次轻量校验
      if (!/^[0-9a-fA-F]+$/.test(entry.name)) {
        continue;
      }
      const ws = await this.tryBuildWorkspace(entry.name);
      if (ws) {
        workspaces.push(ws);
      }
    }

    return workspaces;
  }

  /**
   * 读取指定 workspace 下的全部 sessions（含 memories/repo 工作区级目录 session）。
   *
   * @param workspaceId workspaceStorage/<workspaceId> 中的 workspaceId
   * @returns Session 数组（可能为空）。每个 session 的 title/createdAt 优先从 chatSessions jsonl 提取
   */
  async getSessionsByWorkspace(workspaceId: string): Promise<Session[]> {
    const memoriesDir = this.getMemoriesDir(workspaceId);
    if (!(await this.pathExists(memoriesDir))) {
      return [];
    }

    const entries = await this.safeReadDir(memoriesDir);
    const sessions: Session[] = [];

    for (const entry of entries) {
      if (entry.type !== "directory") {
        continue;
      }

      if (entry.name === "repo") {
        // 特殊的"工作区级目录" session
        const repoPath = path.join(memoriesDir, entry.name);
        const stat = await this.safeStat(repoPath);
        const entryCount = await this.countFiles(repoPath);
        sessions.push({
          id: DEFAULT_SESSION_IDS.REPO,
          workspaceId,
          title: "工作区级目录",
          createdAt: stat ? toIso(stat.birthtime ?? stat.ctime) : new Date(0).toISOString(),
          entryCount,
          isRepo: true,
          // 填充工作区级目录的绝对物理路径，方便右键复制/资源管理器打开
          absolutePath: repoPath,
        });
        continue;
      }

      // base64 编码的 sessionId 目录
      const decoded = decodeSessionDirName(entry.name);
      if (!decoded) {
        continue;
      }
      const sessionDir = path.join(memoriesDir, entry.name);
      const entryCount = await this.countFiles(sessionDir);
      const meta = await this.tryReadSessionMetadata(workspaceId, decoded);
      const dirStat = await this.safeStat(sessionDir);
      sessions.push({
        id: decoded,
        workspaceId,
        title: deriveTitle(meta),
        createdAt: meta?.createdAt
          ? new Date(meta.createdAt).toISOString()
          : dirStat
            ? toIso(dirStat.birthtime ?? dirStat.ctime)
            : new Date(0).toISOString(),
        entryCount,
        isRepo: false,
        // 填充会话目录的绝对物理路径，方便右键复制/资源管理器打开
        absolutePath: sessionDir,
      });
    }

    return sessions;
  }

  /**
   * 读取指定 session 下所有 memory 条目（包括任意类型的普通文件：.md / .json / .png …，
   * 也包含其所在的子目录节点）。
   *
   * 自 v0.0.2 起改为递归扫描：session 目录下的子目录也会被遍历，
   * 每个目录会产出一个 isDirectory=true 的 MemoryEntry，每个文件产出普通条目，
   * 通过 relativePath 字段表达其在 session 目录内的相对路径（POSIX 风格）。
   * 上层 GUI 用 relativePath 重建为多层 FileTreeNode 树。
   *
   * 推荐的调用方式：先用 getSessionsByWorkspace 拿到候选 session.id（或 DEFAULT_SESSION_IDS.REPO），
   * 然后传入该 id 读取文件。对于"工作区级目录" session，需要传 workspaceId 才能定位到 memories/repo。
   *
   * @param sessionId session UUID 或 DEFAULT_SESSION_IDS.REPO
   * @param workspaceId 当 sessionId=DEFAULT_SESSION_IDS.REPO 时必须提供 workspaceId 才能定位目录；
   *                    普通 session UUID 时为可选（用于路径校验/缓存提速）
   */
  async readMemoryContent(
    sessionId: string,
    workspaceId?: string,
  ): Promise<MemoryEntry[]> {
    const sessionDir = await this.resolveSessionDir(sessionId, workspaceId);
    if (!sessionDir) {
      return [];
    }
    const result: MemoryEntry[] = [];
    await this.scanDirRecursive(sessionDir, "", sessionId, result);
    return result;
  }

  /**
   * 递归扫描目录，把文件与子目录都加入 result。
   *
   * @param absoluteDir 当前正在扫描的绝对路径
   * @param relativeDir 相对 session 根目录的路径（POSIX 风格，顶层为空字符串）
   * @param sessionId 所属 session ID（用于组装 entry.id）
   * @param result 输出参数：累积所有 MemoryEntry
   */
  private async scanDirRecursive(
    absoluteDir: string,
    relativeDir: string,
    sessionId: string,
    result: MemoryEntry[],
  ): Promise<void> {
    const entries = await this.safeReadDir(absoluteDir);

    for (const entry of entries) {
      // 组装相对路径（POSIX 风格），便于跨平台使用 / 分隔
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const fullPath = path.join(absoluteDir, entry.name);
      const stat = await this.safeStat(fullPath);
      const isoTime = stat ? toIso(stat.mtime) : new Date(0).toISOString();

      if (entry.type === "directory") {
        // 目录节点：无 content，记录路径与时间戳，递归扫描其内部
        result.push({
          id: `${sessionId}::${relativePath}`,
          sessionId,
          content: "",
          category: "unknown",
          timestamp: isoTime,
          sourceFile: fullPath,
          relativePath,
          isDirectory: true,
        });
        await this.scanDirRecursive(fullPath, relativePath, sessionId, result);
        continue;
      }

      // 普通文件：utf8 读取正文，读取失败跳过
      let content = "";
      try {
        content = await fs.promises.readFile(fullPath, "utf8");
      } catch {
        // 读取失败跳过该文件，不中断整体扫描
        continue;
      }
      result.push({
        id: `${sessionId}::${relativePath}`,
        sessionId,
        content,
        category: "unknown",
        timestamp: isoTime,
        // 存储完整绝对路径，便于 bridge openFile 调用 vscode.workspace.openTextDocument(Uri.file(path))
        sourceFile: fullPath,
        relativePath,
        isDirectory: false,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * 尝试为某个 workspaceId 构建 Workspace 对象。
   * 如果该 workspace 没有 memories 目录，返回 undefined（视为无效工作区）。
   */
  private async tryBuildWorkspace(workspaceId: string): Promise<Workspace | undefined> {
    const memoriesDir = this.getMemoriesDir(workspaceId);
    if (!(await this.pathExists(memoriesDir))) {
      return undefined;
    }

    const folderUri = await this.tryReadWorkspaceFolderUri(workspaceId);
    const folderPath = folderUri ? uriToFsPath(folderUri) : "";
    const name = folderPath ? path.basename(folderPath) : workspaceId;

    const memoriesStat = await this.safeStat(memoriesDir);
    const sessionCount = (await this.getSessionsByWorkspace(workspaceId)).length;

    return {
      id: workspaceId,
      name,
      path: folderPath,
      sessionCount,
      lastModified: memoriesStat ? toIso(memoriesStat.mtime) : new Date(0).toISOString(),
      createdAt: memoriesStat
        ? toIso(memoriesStat.birthtime ?? memoriesStat.ctime)
        : new Date(0).toISOString(),
    };
  }

  /**
   * 读取 workspaceStorage/<workspaceId>/workspace.json 中的 folder URI。
   * 返回 undefined 表示文件缺失、损坏或为多根工作区（workspace 字段）。
   */
  private async tryReadWorkspaceFolderUri(workspaceId: string): Promise<string | undefined> {
    const jsonPath = path.join(this.basePath, workspaceId, "workspace.json");
    try {
      const raw = await fs.promises.readFile(jsonPath, "utf8");
      const obj = JSON.parse(raw) as { folder?: string; workspace?: string };
      return obj.folder ?? obj.workspace;
    } catch {
      return undefined;
    }
  }

  /**
   * 读取 chatSessions/<sessionId>.jsonl 提取 sessionId / createdAt / customTitle / 首条用户消息。
   *
   * 实测磁盘真实路径：`workspaceStorage/<workspaceId>/chatSessions/<sessionId>.jsonl`
   * (注意：chatSessions 目录与 GitHub.copilot-chat 目录是平级兄弟，**不在** GitHub.copilot-chat 下)
   */
  private async tryReadSessionMetadata(
    workspaceId: string,
    sessionId: string,
  ): Promise<ReturnType<typeof parseChatSessionJsonl> | undefined> {
    const jsonlPath = path.join(
      this.metadataBasePath,
      workspaceId,
      "chatSessions",
      `${sessionId}.jsonl`,
    );
    try {
      const content = await fs.promises.readFile(jsonlPath, "utf8");
      return parseChatSessionJsonl(content);
    } catch {
      return undefined;
    }
  }

  /**
   * 获取 memories 目录的绝对路径。
   */
  private getMemoriesDir(workspaceId: string): string {
    return path.join(
      this.basePath,
      workspaceId,
      "GitHub.copilot-chat",
      "memory-tool",
      "memories",
    );
  }

  /**
   * 根据 sessionId 反查 memories 目录中的真实子目录路径。
   *
   * - sessionId === DEFAULT_SESSION_IDS.REPO → 直接返回 memories/repo（需要 workspaceId）
   * - 其他 sessionId → 在 memories/ 下找到解码后等于该 sessionId 的子目录
   */
  private async resolveSessionDir(
    sessionId: string,
    workspaceId?: string,
  ): Promise<string | undefined> {
    if (!workspaceId) {
      return undefined;
    }
    const memoriesDir = this.getMemoriesDir(workspaceId);

    if (sessionId === DEFAULT_SESSION_IDS.REPO) {
      const repoDir = path.join(memoriesDir, "repo");
      return (await this.pathExists(repoDir)) ? repoDir : undefined;
    }

    const entries = await this.safeReadDir(memoriesDir);
    for (const entry of entries) {
      if (entry.type !== "directory") continue;
      const decoded = decodeSessionDirName(entry.name);
      if (decoded === sessionId) {
        return path.join(memoriesDir, entry.name);
      }
    }
    return undefined;
  }

  /**
   * 递归统计目录下所有普通文件的数量（不再按扩展名过滤）。
   * 用于 Session.entryCount / Repo session.entryCount 字段。
   */
  private async countFiles(dir: string): Promise<number> {
    const entries = await this.safeReadDir(dir);
    let count = 0;
    for (const entry of entries) {
      if (entry.type === "file") {
        count++;
      } else if (entry.type === "directory") {
        count += await this.countFiles(path.join(dir, entry.name));
      }
    }
    return count;
  }

  /**
   * 安全地 readdir，失败时返回空数组。
   */
  private async safeReadDir(
    dir: string,
  ): Promise<{ name: string; type: "file" | "directory" }[]> {
    try {
      const result = await fs.promises.readdir(dir, { withFileTypes: true });
      return result.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? ("directory" as const) : ("file" as const),
      }));
    } catch {
      return [];
    }
  }

  /**
   * 安全地 stat，失败时返回 undefined。
   */
  private async safeStat(p: string): Promise<fs.Stats | undefined> {
    try {
      return await fs.promises.stat(p);
    } catch {
      return undefined;
    }
  }

  /**
   * 路径存在性检查（兼容文件与目录）。
   */
  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.promises.access(p);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level pure helpers
// ---------------------------------------------------------------------------

/**
 * 将 Date / number 转换为 ISO 8601 字符串。
 */
function toIso(t: Date | number): string {
  const d = typeof t === "number" ? new Date(t) : t;
  return d.toISOString();
}

/**
 * 把 memories 目录下的子目录名（base64 编码的 sessionId UUID）解码为原始 UUID。
 *
 * 例：`MmU0ZDYyNDEtYWY5MS00OGQzLTkyNTItZTMxMWJhMWNlMTM1` → `2e4d6241-af91-48d3-9252-e311ba1ce135`
 *
 * 仅接受解码后形如 UUID（8-4-4-4-12 hex）的结果；不符合格式则返回 undefined。
 */
export function decodeSessionDirName(dirName: string): string | undefined {
  let decoded: string;
  try {
    decoded = Buffer.from(dirName, "base64").toString("utf8");
  } catch {
    return undefined;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)) {
    return undefined;
  }
  return decoded;
}

/**
 * 把 file:// URI 转换成本地文件系统路径（仅处理 file 协议、URL 解码 %xx）。
 *
 * 例：`file:///e%3A/projects/foo` → Windows: `e:\projects\foo`，POSIX: `/e:/projects/foo`
 */
export function uriToFsPath(uri: string): string {
  if (!uri.startsWith("file:")) {
    return "";
  }
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return "";
  }
  // 使用 decodeURIComponent 解码 URL 编码的字符（如 Windows 盘符中的 %3A -> :）
  const pathname = decodeURIComponent(parsed.pathname);
  // Windows 盘符路径形如 "/e:/..."，需要把开头的 / 去掉
  const isWinDrive = /^\/[a-zA-Z]:/.test(pathname);
  const fsPath = isWinDrive ? pathname.slice(1) : pathname;
  return fsPath.replace(/\//g, path.sep);
}

/**
 * 根据 jsonl 元数据推导出 session 显示标题。
 *
 * 优先级：
 * 1. customTitle（LLM 生成或用户重命名）
 * 2. 首条用户消息文本前 80 字符（去空白、单行）
 * 3. fallback `<未命名会话>`
 */
function deriveTitle(meta: ReturnType<typeof parseChatSessionJsonl> | undefined): string {
  if (!meta) {
    return "<未命名会话>";
  }
  if (meta.customTitle && meta.customTitle.trim().length > 0) {
    return meta.customTitle.trim();
  }
  if (meta.firstUserMessage && meta.firstUserMessage.trim().length > 0) {
    const oneLine = meta.firstUserMessage.replace(/\s+/g, " ").trim();
    return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
  }
  return "<未命名会话>";
}
