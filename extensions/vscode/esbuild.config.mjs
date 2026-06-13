// ============================================================================
// esbuild.config.mjs — VS Code Extension Bundler Configuration
// ============================================================================
// 将扩展入口 + @memory-board/core 打包为单个 CJS 文件
// 仅外部化 vscode 模块（由 VS Code 宿主提供）
// ============================================================================

import { build, context } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('esbuild').BuildOptions} */
const shared = {
  entryPoints: [resolve(__dirname, "src/extension.ts")],
  bundle: true,
  // 外部化 vscode 模块（运行时由 VS Code 宿主提供）
  external: ["vscode"],
  // 目标 CJS 格式，兼容扩展 host
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
  // 直接将 @memory-board/core 源码内联到 bundle，无需 workspace 链接
  alias: {
    "@memory-board/core": resolve(__dirname, "..", "..", "core", "src", "index.ts"),
  },
  outfile: resolve(__dirname, "dist", "extension.js"),
};

if (process.argv.includes("--watch")) {
  // 开发模式：watch + serve
  const ctx = await context(shared);
  await ctx.watch();
  console.log("[esbuild] Watching for changes...");
} else {
  // 生产模式：单次构建
  await build(shared);
  console.log("[esbuild] Build complete: dist/extension.js");
}
