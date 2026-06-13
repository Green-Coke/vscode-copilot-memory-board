# Architecture Design — vscode-copilot-memory-board

## Overview

本项目采用**三层解耦架构**，通过 pnpm Monorepo 管理多个包，使核心逻辑和前端界面可以在不同宿主环境（VS Code 插件、未来的 Electron 桌面端）之间无缝复用。

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                 Extension Shells                 │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  extensions/      │  │  extensions/          │  │
│  │  vscode/          │  │  desktop/ (future)    │  │
│  │                   │  │                       │  │
│  │  WebviewView      │  │  Electron BrowserWin  │  │
│  │  Provider         │  │  + IPC Bridge         │  │
│  └────────┬─────────┘  └────────┬─────────────┘  │
│           │ postMessage          │ IPC             │
├───────────┼──────────────────────┼─────────────────┤
│           ▼                      ▼                 │
│  ┌─────────────────────────────────────────────┐  │
│  │              @memory-board/gui               │  │
│  │                                              │  │
│  │  React + Tailwind CSS + shadcn/ui            │  │
│  │  Adaptive Layout (3-col / 2-col / 1-col)    │  │
│  │  Bridge Adapter (environment-agnostic)       │  │
│  └──────────────────────┬──────────────────────┘  │
│                          │ type imports only       │
├──────────────────────────┼─────────────────────────┤
│                          ▼                         │
│  ┌─────────────────────────────────────────────┐  │
│  │             @memory-board/core               │  │
│  │                                              │  │
│  │  Pure Node.js/TypeScript                     │  │
│  │  MemoryParser, types, protocol definitions   │  │
│  │  Zero DOM / Zero VS Code API dependencies    │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Layer Responsibilities

### 1. `@memory-board/core` — 核心逻辑层
- **纯 Node.js/TypeScript**，不引入任何 DOM 或宿主 API
- 负责扫描本地 Copilot 记忆目录
- 解析 Session ID 与仓库关联
- 读取和解析记忆文本文件
- 导出 TypeScript 类型和通信协议定义

### 2. `@memory-board/gui` — 前端界面层
- **React + Vite + Tailwind CSS + shadcn/ui**
- 提供自适应的看板 UI（三栏 ↔ 双栏 ↔ 单栏）
- 通过 **Bridge Adapter** 发送异步消息请求数据
- **绝不直接调用** `fs`、`child_process` 或任何底层 API
- 仅引用 `@memory-board/core` 的类型定义

### 3. Extension Shells — 宿主外壳层
- 充当「胶水」角色，连接 `gui` 和 `core`
- 监听 `gui` 发来的 postMessage，路由到 `core` 处理
- 将 `core` 的返回结果通过响应消息推送回 `gui`

## Data Flow

```
[User Interaction in GUI]
        │
        ▼
[Bridge.request('getRepos', {})]
        │ postMessage / IPC
        ▼
[Extension Host receives message]
        │
        ▼
[core.MemoryParser.scanRepositories()]
        │
        ▼
[Extension Host sends response]
        │ postMessage / IPC
        ▼
[Bridge receives response, resolves Promise]
        │
        ▼
[React state update → UI re-render]
```

## Key Design Decisions

1. **Message-based communication**: GUI 层通过消息协议与后端通信，不直接依赖任何宿主 API
2. **Environment-agnostic Bridge**: 桥接适配器自动检测运行环境，开发时使用 Mock
3. **Type-only imports**: GUI 仅从 core 导入 TypeScript 类型，不导入运行时代码
4. **Responsive-first**: 界面为侧边栏的窄视图优先设计，再向宽屏扩展
