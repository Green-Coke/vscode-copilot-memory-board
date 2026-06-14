// ===========================================================================
// 主题注入：在 React 渲染之前同步执行，确保 CSS 变量在首次布局前就绪。
// VS Code 模式：VS Code 运行时自动注入 body.vscode-dark/light/high-contrast，
//               无需手动处理。
// Standalone 浏览器：acquireVsCodeApi 不存在，手动注入 theme-macaron。
// 单体应用（未来 Electron）：可在此扩展环境检测逻辑。
// ===========================================================================
if (typeof acquireVsCodeApi !== "function") {
  document.body.classList.add("theme-macaron");
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found. Ensure index.html has a <div id='root'>.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
