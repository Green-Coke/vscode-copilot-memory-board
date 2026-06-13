# vscode-copilot-memory-board

> Visualize and manage GitHub Copilot's long-term memory as an interactive board.

## 📦 Project Structure

This is a **pnpm monorepo** designed for maximum code reuse across multiple platforms.

```
vscode-copilot-memory-board/
├── docs/                  # Design docs, protocol specs, research notes
├── core/                  # Shared core logic (pure Node.js/TS)
├── gui/                   # Shared frontend UI (React + Tailwind + shadcn/ui)
├── extensions/
│   ├── vscode/            # VS Code extension shell
│   └── desktop/           # (Future) Standalone desktop app
├── package.json           # Root workspace config
└── pnpm-workspace.yaml    # Workspace package definitions
```

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) >= 20.0.0
- [pnpm](https://pnpm.io/) >= 9.0.0

### Install & Build

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run GUI in development mode
pnpm --filter @memory-board/gui dev
```

### VS Code Extension Development

1. Open this project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Look for the **Memory Board** icon in the Activity Bar sidebar

## 📚 Documentation

- [Architecture Design](./docs/architecture.md)
- [Communication Protocol](./docs/protocol.md)
- [Copilot LTM Research](./docs/research.md)

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| Core Logic | TypeScript, Node.js |
| Frontend UI | React 19, Vite 6, Tailwind CSS v4, shadcn/ui |
| VS Code Extension | VS Code Extension API, WebviewViewProvider |
| Desktop (Future) | Electron / Tauri |

## 📄 License

MIT
