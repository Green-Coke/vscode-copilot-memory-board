/**
 * 文件树节点接口定义
 */
export interface MockFsNode {
  /** 节点名称（如文件名或文件夹名） */
  name: string;
  /** 节点类型：dir 表示文件夹，file 表示文件 */
  type: "dir" | "file";
  /** 子节点列表（仅文件夹有此属性） */
  children?: MockFsNode[];
  /** 文件类型：text 表示文本/代码，image 表示图片，unknown 表示未知格式 */
  fileType?: "text" | "image" | "unknown";
  /** 文件文本内容（仅文本文件有此属性） */
  content?: string;
  /** 文件图片链接或 Base64 资源（仅图片文件有此属性） */
  src?: string;
}

/**
 * 根据不同的 Session ID 生成模拟的文件树数据
 * @param sessionId 当前选中的会话 ID
 * @returns 多层级的 MockFsNode 数组，包含代码文件、Markdown 文件、图片等
 */
export function getMockFileTree(sessionId: string): MockFsNode[] {
  // 生成与 sessionId 有关的一些特定字符，以展示个性化 mock 数据
  const suffix = sessionId.substring(0, 6);

  return [
    {
      name: "src",
      type: "dir",
      children: [
        {
          name: "components",
          type: "dir",
          children: [
            {
              name: "Header.tsx",
              type: "file",
              fileType: "text",
              content: `// ============================================================================
// Header Component — Application Top Navigation Header
// ============================================================================
import React from "react";
import { Terminal, FolderGit2 } from "lucide-react";

interface HeaderProps {
  title: string;
  repoName?: string;
}

/**
 * 顶部导航组件，渲染系统 Logo 与当前活跃的仓库状态
 */
export function Header({ title, repoName }: HeaderProps) {
  return (
    <header className="flex items-center justify-between p-4 border-b border-border bg-surface shadow-md">
      <div className="flex items-center gap-2">
        <Terminal className="w-5 h-5 text-indigo-500" />
        <h1 className="text-lg font-bold">${suffix}-Memory-Board</h1>
      </div>
      {repoName && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-muted rounded border border-border">
          <FolderGit2 className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium">{repoName}</span>
        </div>
      )}
    </header>
  );
}`,
            },
            {
              name: "Sidebar.tsx",
              type: "file",
              fileType: "text",
              content: `import React, { useState } from "react";
import { FolderGit2, Menu } from "lucide-react";

/**
 * 侧边栏导航组件，支持面板折叠与列表展开
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  
  return (
    <aside className={collapsed ? "w-16" : "w-64"}>
      <div className="flex items-center justify-between p-3 border-b">
        {!collapsed && <span className="font-bold">导航</span>}
        <button onClick={() => setCollapsed(!collapsed)}>
          <Menu className="w-4 h-4" />
        </button>
      </div>
      <ul className="flex flex-col gap-1 p-2">
        <li className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded">
          <FolderGit2 className="w-4 h-4 text-slate-500" />
          {!collapsed && <span>我的项目</span>}
        </li>
      </ul>
    </aside>
  );
}`,
            },
          ],
        },
        {
          name: "utils",
          type: "dir",
          children: [
            {
              name: "helpers.ts",
              type: "file",
              fileType: "text",
              content: `/**
 * 格式化相对时间戳为人类可读的格式
 * @param dateString ISO 日期字符串
 * @returns 相对时间说明字符串
 */
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return \`\${diffMinutes}分钟前\`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return \`\${diffHours}小时前\`;
  
  return date.toLocaleDateString("zh-CN");
}

/**
 * 安全解析 JSON 字符串，防止程序崩溃
 * @param json 原始 JSON 文本
 * @param defaultValue 解析失败时的默认返回值
 */
export function safeParseJson<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    console.error("JSON 解析错误:", err);
    return defaultValue;
  }
}`,
            },
          ],
        },
        {
          name: "index.css",
          type: "file",
          fileType: "text",
          content: `/* 主体应用排版与背景渐变 */
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen;
  background-color: var(--color-surface-0);
  color: var(--color-text-primary);
}

/* 磨砂玻璃效果 */
.glass-panel {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
}`,
        },
      ],
    },
    {
      name: "public",
      type: "dir",
      children: [
        {
          name: "copilot-preview.jpg",
          type: "file",
          fileType: "image",
          src: "https://picsum.photos/id/1/600/400",
        },
        {
          name: "banner.png",
          type: "file",
          fileType: "image",
          src: "https://picsum.photos/id/48/800/400",
        },
      ],
    },
    {
      name: "README.md",
      type: "file",
      fileType: "text",
      content: `# VS Code Copilot Memory Board (${suffix})

欢迎来到 GitHub Copilot 内存看板！

本看板是专为开发者管理和审查本地 GitHub Copilot Chat 会话上下文和偏好数据设计的图形界面。

## 核心特性

1. **响应式架构**：支持大屏幕的等比例放大，搜索框优化以防文字图标贴脸。
2. **仓库列表快速折叠**：支持隐藏左侧的仓库栏，通过顶部下拉框进行快速仓库切换。
3. **VS Code 风格文件资源管理器**：右侧完全替换为文件资源树与实时文件预览模式，支持文本文件高亮与图片预览。

## 操作指南

- **侧边栏**：点击顶部左侧按钮，或选择任意仓库，可实现左侧栏的折叠与展开。
- **文件树**：在右侧栏展开 \`src\` 文件夹，点击任意文件可以在右侧即时加载它的内容或图片。
- **图片预览**：可以在 \`public\` 中查看各种 mock 图片资源。

感谢使用！`,
    },
    {
      name: "package.json",
      type: "file",
      fileType: "text",
      content: `{
  "name": "@memory-board/mock-project-${suffix}",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.469.0"
  }
}`,
    },
    {
      name: "config.bin",
      type: "file",
      fileType: "unknown",
    },
  ];
}
