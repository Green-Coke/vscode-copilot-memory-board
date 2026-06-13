/// <reference types="vite/client" />

/**
 * VS Code Webview API type declaration.
 * Available when running inside a VS Code webview panel.
 */
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;
