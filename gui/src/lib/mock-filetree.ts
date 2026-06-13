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
  /**
   * 节点创建时间（ISO 8601），用于按创建时间排序
   * 真实扩展场景需通过读取文件系统 stat 信息获取，mock 模式下由本文件直接给出
   */
  createdAt?: string;
  /**
   * 节点更新时间（ISO 8601），用于按更新时间排序
   * 真实扩展场景需通过读取文件系统 stat 信息获取，mock 模式下由本文件直接给出
   */
  updatedAt?: string;
}

/**
 * 根据不同的 Session ID 生成模拟的文件树数据
 * @param sessionId 当前选中的会话 ID
 * @returns 多层级的 MockFsNode 数组，包含代码文件、Markdown 文件、图片等
 */
export function getMockFileTree(sessionId: string): MockFsNode[] {
  // 生成与 sessionId 有关的一些特定字符，以展示个性化 mock 数据
  const suffix = sessionId.substring(0, 6);
  // 文件/目录时间元数据基线，用于演示按时间排序能力
  const baseDate = "2026-06-01T00:00:00.000Z";

  return [
    {
      name: "src",
      type: "dir",
      createdAt: "2026-05-20T09:00:00.000Z",
      updatedAt: "2026-06-12T16:00:00.000Z",
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
      createdAt: "2026-05-22T11:00:00.000Z",
      updatedAt: "2026-06-09T10:00:00.000Z",
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
        {
          name: "ui-screenshot.png",
          type: "file",
          fileType: "image",
          src: "https://picsum.photos/id/180/600/400",
        },
        {
          name: "changelog.txt",
          type: "file",
          fileType: "text",
          content: `变更记录 (${suffix})
==========================

- 2026-06-13  优化搜索框图标布局，放大镜迁移到输入框最右侧，避免与清空按钮重叠。
- 2026-06-12  修复选中会话后 Memory Entries 文件树为空的问题，补齐 mock 文件预览。
- 2026-06-10  提升整体显示比例，调整桌面端字号与三栏布局宽度。

备注：这是一个纯文本 (.txt) 格式的示例文件，用于测试文本类预览能力。`,
        },
      ],
    },
    {
      name: "README.md",
      type: "file",
      fileType: "text",
      createdAt: "2026-05-25T08:30:00.000Z",
      updatedAt: "2026-06-13T09:12:00.000Z",
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
      createdAt: "2026-05-20T09:05:00.000Z",
      updatedAt: "2026-06-10T14:00:00.000Z",
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
      createdAt: "2026-05-26T13:00:00.000Z",
      updatedAt: "2026-06-08T18:30:00.000Z",
    },
    {
      name: "notes.txt",
      type: "file",
      fileType: "text",
      createdAt: "2026-06-05T09:20:00.000Z",
      updatedAt: "2026-06-11T15:45:00.000Z",
      content: `笔记 (${suffix})
==========================

1. 演示用途的纯文本文档，用于测试 .txt 文件在右侧预览区的渲染效果。
2. 点击左侧文件树的其它 .md / .json / .png 可以分别查看对应内容。
3. 左侧搜索框放大镜现已固定在输入框最右侧，输入内容时清空按钮会自动向左避让，二者不再重叠。

这是一些相对较长的文本行，用于验证  等宽字体在 pre 块中的换行与对齐效果：
> Memory Board 帮助你快速浏览和审查 GitHub Copilot Chat 的本地会话上下文。`,
    },
    {
      name: "manifest.json",
      type: "file",
      fileType: "text",
      createdAt: "2026-05-28T10:15:00.000Z",
      updatedAt: "2026-06-12T11:00:00.000Z",
      content: `{
  "id": "${suffix}",
  "name": "copilot-memory-board-demo",
  "version": "1.0.0",
  "description": "用于演示 Memory Entries 文件树与预览能力的 mock 项目清单",
  "capturedAt": "2026-06-13T10:00:00.000Z",
  "categories": ["preference", "context", "instruction", "knowledge"],
  "stats": {
    "entries": 12,
    "files": 9,
    "images": 3
  },
  "author": {
    "name": "memory-board",
    "type": "system"
  }
}`,
    },
  ];
}

/**
 * 根据仓库 ID 生成仓库级骨架文件树
 *
 * 与会话级文件树（getMockFileTree）不同，这里展示整个仓库的完整目录结构，
 * 包含 .vscode、docs、src、gui 等典型仓库骨架，便于演示 "仓库级目录" 视图。
 *
 * @param repoId 当前选中的仓库 ID，用于生成个性化标识
 * @returns 多层级的 MockFsNode 数组，包含文本、JSON、Markdown、图片等示例文件
 */
export function getMockRepoFileTree(repoId: string): MockFsNode[] {
  // 取仓库 ID 后缀片段，用于在示例内容中体现个性化数据
  const suffix = repoId.split("-").pop() ?? "repo";

  return [
    {
      name: ".vscode",
      type: "dir",
      createdAt: "2026-05-21T10:00:00.000Z",
      updatedAt: "2026-06-07T09:30:00.000Z",
      children: [
        {
          name: "settings.json",
          type: "file",
          fileType: "text",
          createdAt: "2026-05-21T10:05:00.000Z",
          updatedAt: "2026-06-07T09:30:00.000Z",
          content: `{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.tabSize": 2,
  "files.autoSave": "onFocusChange",
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/pnpm-lock.yaml": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}`,
        },
        {
          name: "extensions.json",
          type: "file",
          fileType: "text",
          content: `{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}`,
        },
      ],
    },
    {
      name: "docs",
      type: "dir",
      createdAt: "2026-05-23T14:00:00.000Z",
      updatedAt: "2026-06-10T16:30:00.000Z",
      children: [
        {
          name: "architecture.md",
          type: "file",
          fileType: "text",
          content: `# 架构说明

Memory Board 采用三层结构：

1. **GUI（前端）**：React + TypeScript，负责交互与展示。
2. **Bridge（桥接层）**：在 standalone 浏览器模式与 VS Code webview 模式间抽象请求。
3. **Core（共享核心）**：类型定义与内存解析器，可被多个宿主复用。

> 当前查看的是仓库 \`${suffix}\` 的整体文件结构。`,
        },
        {
          name: "protocol.md",
          type: "file",
          fileType: "text",
          content: `# 通信协议

GUI 与宿主之间通过受限的 postMessage 协议通信，
所有请求都带 requestId，便于配对响应。`,
        },
        {
          name: "screenshot.png",
          type: "file",
          fileType: "image",
          src: "https://picsum.photos/seed/repo-docs-screenshot/800/500",
        },
      ],
    },
    {
      name: "src",
      type: "dir",
      children: [
        {
          name: "extension.ts",
          type: "file",
          fileType: "text",
          content: `// VS Code 扩展入口，注册 webview 并建立 bridge 通信
import * as vscode from "vscode";
import { WebviewProvider } from "./webview-provider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new WebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("memory-board.view", provider)
  );
}`,
        },
        {
          name: "webview-provider.ts",
          type: "file",
          fileType: "text",
          content: `// 负责创建并持有 webview 实例，转发消息到 bridge
import * as vscode from "vscode";

export class WebviewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml(view.webview);
  }

  private getHtml(webview: vscode.Webview): string {
    return "<!doctype html><html><body>Memory Board</body></html>";
  }
}`,
        },
      ],
    },
    {
      name: "README.md",
      type: "file",
      fileType: "text",
      content: `# Memory Board

> 仓库级目录视图示例：\`${suffix}\`

Memory Board 是一个用于浏览和审查 GitHub Copilot Chat 本地会话记忆的工具。

## 特性

- 📦 多仓库 / 多会话 / 多条目的层级浏览
- 🎨 响应式三栏布局，桌面宽屏下放大显示
- 🧩 同时支持独立浏览器模式与 VS Code webview 模式

## 快速开始

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## 目录结构

- \`gui/\` 前端 React 应用
- \`extensions/vscode/\` VS Code 扩展宿主
- \`core/\` 跨宿主共享的类型与解析逻辑
`,
    },
    {
      name: "package.json",
      type: "file",
      fileType: "text",
      content: `{
  "name": "vscode-copilot-memory-board",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @memory-board/gui dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}`,
    },
    {
      name: "tsconfig.base.json",
      type: "file",
      fileType: "text",
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@memory-board/core": ["core/src/index.ts"]
    }
  }
}`,
    },
    {
      name: "changelog.txt",
      type: "file",
      fileType: "text",
      content: `Changelog (${suffix})
==========================

[1.0.0] - 2026-06-13
- 新增仓库级目录视图
- 统一搜索框放大镜至右侧
- 提升选中态颜色对比度

[0.9.0] - 2026-05-28
- 初版三栏布局
- Mock 文件树与预览能力`,
    },
    {
      name: "banner.png",
      type: "file",
      fileType: "image",
      src: "https://picsum.photos/seed/repo-banner/900/300",
    },
    {
      name: "logo.svg",
      type: "file",
      fileType: "text",
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="#2563eb" />
  <text x="50" y="58" font-size="28" text-anchor="middle" fill="#fff">M</text>
</svg>`,
    },
  ];
}
