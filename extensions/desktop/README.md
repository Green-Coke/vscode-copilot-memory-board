# Desktop Shell (Future)

> This directory is reserved for the standalone desktop application shell (Electron or Tauri).

## Status: Not Yet Started

The desktop shell will:
- Use `@memory-board/core` for memory scanning and parsing
- Use `@memory-board/gui` for the React-based UI
- Replace `postMessage` with IPC-based communication via the Bridge adapter
- Provide native OS integration (file dialogs, system tray, etc.)

## Planned Architecture

```
desktop/
├── src/
│   ├── main.ts          # Electron main process / Tauri backend
│   ├── preload.ts       # Preload script for IPC bridge
│   └── ipc-handler.ts   # IPC message router (mirrors vscode webview-provider)
├── package.json
└── tsconfig.json
```
