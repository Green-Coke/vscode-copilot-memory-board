// ============================================================================
// clipboard-files — 系统剪贴板文件列表读取辅助工具
// ============================================================================
// 通过 child_process 调用平台原生命令读取系统剪贴板中的文件列表。
// 用于实现"外部资源管理器复制文件 → Memory Board 内粘贴"的场景。
//
// 平台支持：
//   - Windows：通过 PowerShell Get-Clipboard -Format FileDropList 读取
//   - macOS / Linux：暂不支持，返回 unsupported 标记
// ============================================================================

import { spawn } from "child_process";

/**
 * 读取系统剪贴板中文件列表的返回结果
 */
export interface ClipboardFilesResult {
  /** 剪贴板中的文件绝对路径列表 */
  paths: string[];
  /** 当前平台是否不支持此功能 */
  unsupported?: boolean;
}

/**
 * 读取系统剪贴板中的文件路径列表。
 *
 * 实现原理：
 * - Windows：调用 PowerShell 的 Get-Clipboard -Format FileDropList 命令，
 *   该命令可读取资源管理器中"复制"操作写入的 CF_HDROP 格式数据。
 *   PowerShell 随 Windows 系统 100% 覆盖，是最稳定的方案。
 * - macOS：需要 osascript + Swift helper 或 plist 解析，本次不实现。
 * - Linux：不支持。
 *
 * 注意：vscode.env.clipboard 只暴露 readText()，无法读取 CF_HDROP 等
 * 二进制剪贴板格式。VS Code 自身资源管理器能粘贴是因为走了 Electron 原生代码，
 * 第三方扩展只能通过 child_process 间接读取。
 *
 * @returns 文件路径列表；若当前平台不支持则返回 unsupported: true
 */
export async function readClipboardFilePaths(): Promise<ClipboardFilesResult> {
  // 仅 Windows 平台支持
  if (process.platform !== "win32") {
    return { paths: [], unsupported: true };
  }

  return new Promise<ClipboardFilesResult>((resolve) => {
    // 使用 PowerShell 读取剪贴板中的文件列表
    // -NoProfile: 跳过加载用户配置以加快启动
    // Get-Clipboard -Format FileDropList: 读取文件拖放列表格式
    // ForEach-Object { $_.FullName }: 输出每个文件的完整路径
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      'Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }',
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.warn(
          `[clipboard-files] PowerShell 退出码 ${code}，stderr: ${stderr.trim()}`
        );
        resolve({ paths: [] });
        return;
      }

      // 解析输出：每行一个绝对路径，过滤空行
      const paths = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      resolve({ paths });
    });

    // 超时保护：5 秒无响应则放弃
    setTimeout(() => {
      try {
        child.kill();
      } catch {
        // 忽略 kill 失败
      }
      resolve({ paths: [] });
    }, 5000);
  });
}
