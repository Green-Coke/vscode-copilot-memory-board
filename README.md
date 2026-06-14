# Copilot Memory Board

> **English** | [中文](./README-zh.md)

**Visualize and manage GitHub Copilot's memory as an interactive board in VS Code.**

GitHub Copilot accumulates "memories" across conversations — recording your project context, coding preferences, architectural decisions, and other long-term information. These memories are stored locally as Markdown files, but there's no built-in interface to browse or manage them.

**Copilot Memory Board** fills that gap: it provides an adaptive kanban-style board in the VS Code sidebar, letting you browse, search, and manage all Copilot memories in a three-level hierarchy: **Workspace → Session → Memory Entry**.

---

## ✨ Features

### 📂 Workspace-Level Memory Browsing
- Automatically scans all local workspaces that contain Copilot memory data
- Displays summary info for each workspace: session count, last modified time, etc.
- Supports a "Workspace Root Directory" view — browse repo-level memories shared across sessions

### 💬 Session-Level Memory Browsing
- Filters sessions by workspace, showing session title, creation time, and entry count
- Supports sorting (by time, name) and search filtering
- Session titles are auto-derived from the chat's `customTitle` or the first user message

### 📝 Memory Entry Details
- Recursively scans all files and subdirectories under a session directory, displayed as a tree structure
- Supports Markdown rendering preview and raw text viewing

<p align="center">
  <img src="./docs/assets/session-memories.png" alt="Session Memories View" width="160" />
  <br/>
  <em>Session-level memory browsing — see what Copilot remembered in a single session</em>
</p>

<p align="center">
  <img src="./docs/assets/workspace-memories.png" alt="Workspace Memories View" width="160" />
  <br/>
  <em>Workspace-level memory browsing — view repo-level memories shared across sessions</em>
</p>

---

## 🚀 Installation

Install through VS Code extensions. Search for `Copilot Memory Board`

[Visual Studio Code Market Place: Copilot Memory Board](https://marketplace.visualstudio.com/items?itemName=Green-Coke.vscode-copilot-memory-board)

Can also be installed in VS Code: Launch VS Code Quick Open (Ctrl+P), paste the following command, and press enter.

```
ext install Green-Coke.vscode-copilot-memory-board
```

---

## 📄 License

[MIT](./LICENSE)
