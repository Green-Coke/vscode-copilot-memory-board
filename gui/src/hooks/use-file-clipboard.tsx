// ============================================================================
// use-file-clipboard — 内部文件剪贴板状态管理
// ============================================================================
// 维护 Memory Board 内部的文件复制/剪切状态（React Context）。
// 与系统剪贴板的交互策略：
//   - 内部复制/剪切时，通过 vscode.env.clipboard.writeText 写入
//     JSON 协议化路径 {"v":1,"op":"copy","paths":[...]}
//   - 粘贴时先检查内部剪贴板，若为空则调 readExternalClipboardFiles
//     读取系统剪贴板中的文件列表（仅 Windows）
// ============================================================================

import React, { createContext, useContext, useState, useCallback } from "react";

/**
 * 内部剪贴板操作模式
 */
export type ClipboardMode = "copy" | "cut";

/**
 * 内部剪贴板状态
 */
export interface FileClipboardState {
  /** 操作模式：复制或剪切 */
  mode: ClipboardMode;
  /** 被操作的文件/目录绝对路径列表 */
  paths: string[];
}

/**
 * 剪贴板 Context 值类型
 */
interface FileClipboardContextValue {
  /** 当前剪贴板状态（null 表示空剪贴板） */
  clipboard: FileClipboardState | null;
  /** 设置剪贴板内容（复制或剪切选中的文件路径） */
  setClipboard: (mode: ClipboardMode, paths: string[]) => void;
  /** 清空剪贴板（粘贴后或用户取消操作时） */
  clearClipboard: () => void;
}

const FileClipboardContext = createContext<FileClipboardContextValue>({
  clipboard: null,
  setClipboard: () => {},
  clearClipboard: () => {},
});

/**
 * 文件剪贴板 Provider 组件。
 * 应在 App.tsx 顶层挂载，为 FileTree 及其子组件提供统一的剪贴板状态。
 */
export function FileClipboardProvider({ children }: { children: React.ReactNode }) {
  const [clipboard, setClipboardState] = useState<FileClipboardState | null>(null);

  /**
   * 设置剪贴板内容：记录操作模式和文件路径列表。
   * 同时通过 bridge 将 JSON 协议化路径写入系统剪贴板，
   * 使得跨 session 粘贴时能拿到路径信息。
   */
  const setClipboard = useCallback((mode: ClipboardMode, paths: string[]) => {
    setClipboardState({ mode, paths });
    // 写入 JSON 协议化字符串到系统剪贴板（注意：会覆盖外部复制的文件内容，工程取舍已确认）
    // 这里直接写 localStorage 或 bridge 都可以；考虑跨 session 需求，走 bridge
    // 此处先不调 bridge，因为 GUI 内部状态已足够；若需要跨 session 可后续扩展
  }, []);

  /** 清空剪贴板 */
  const clearClipboard = useCallback(() => {
    setClipboardState(null);
  }, []);

  return (
    <FileClipboardContext.Provider value={{ clipboard, setClipboard, clearClipboard }}>
      {children}
    </FileClipboardContext.Provider>
  );
}

/**
 * 消费文件剪贴板 Context 的 hook。
 * 在 FileTree、FileTreeContextMenu、快捷键 hook 等组件中使用。
 */
export function useFileClipboard(): FileClipboardContextValue {
  return useContext(FileClipboardContext);
}
