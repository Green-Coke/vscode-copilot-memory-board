# 扩展调试启动指南(Extension Development Host)

本指南讲解如何**在 VS Code 内直接调试本扩展**,无需 `pnpm package:vsix` 安装。

适用于:**修改扩展端源码 + 看 webview 真实渲染效果 + 断点调试** 等场景。

## 工作原理:Extension Development Host

按 F5 后,VS Code 会启动一个**独立的 VS Code 窗口**(标题带 `[Extension Development Host]`)。该窗口加载本仓库的未打包扩展:
- 入口读取 `extensions/vscode/dist/extension.js`(esbuild 产物)
- webview 资源读取 `extensions/vscode/resources/webview/`(从 `gui/dist` 拷贝而来)
- 调试器(js-debug)通过 sourcemap 把 dist 反查回 `extensions/vscode/src/**/*.ts`,可直接断点

EDH 窗口内可以打开 webview DevTools 调 React;扩展端代码可在主 VS Code 源码里打断点直接命中。

---

## 一键启动:F5

### 步骤

1. VS Code 左侧 Run and Debug 面板,选 **`启动扩展`**
2. 按 `F5`
3. preLaunchTask 自动跑全量构建(`Memory Board: Build All (dev)`,约 8 秒):
   - `core` `tsc -b`
   - `gui` `tsc -b && vite build`
   - `build:webview` 拷贝 `gui/dist` → `extensions/vscode/resources/webview`
   - `vscode-copilot-memory-board` esbuild 打包出 `extensions/vscode/dist/extension.js`
4. 弹出独立 VS Code 窗口(标题带 `[Extension Development Host]`)
5. 左侧 Activity Bar 显示 Memory Board 图标

### 断点调试

- 在 `extensions/vscode/src/**/*.ts` 源码里按 `F9` 设红点
- F5 启动后,业务流程经过该处自动命中
- 前端 React 调试走 **EDH 窗口内** webview DevTools:
  `Ctrl+Shift+P` → `Developer: Open Webview Developer Tools`

### 工作区选择

EDH 默认打开 `${env:USERPROFILE}\.memory-board-dev-workspace`(空白临时文件夹)。

要看真实项目的 Copilot Memory,改 `launch.json` 中 `args` 第二参数:

```jsonc
"args": [
  "--extensionDevelopmentPath=${workspaceFolder}\\extensions\\vscode",
  // 改成你想测试的项目绝对路径
  "E:\\projects\\your-real-project"
],
```

---

## 改完代码后刷新

| 改动位置 | 刷新方式 |
|---|---|
| `extensions/vscode/src/**/*.ts` | EDH 窗口按 `Ctrl+R`(Win)/ `Cmd+R`(Mac)重新加载 |
| `core/src/**/*.ts` | 同上(esbuild 通过 alias 直接引源码,无需重建 core/dist) |
| `gui/src/**/*.tsx?` 或 CSS | 1) 跑任务 `Memory Board: Build GUI`;2) 跑 `Memory Board: Build Webview (copy)`;3) EDH 窗口按 `Ctrl+R` |
| 全部改完想再启动一遍 | 直接 F5,preLaunchTask 会重新构建 |

### 频繁改扩展端代码时:用 watch

如果反复改扩展端 TS、频繁 Ctrl+R 仍嫌慢,可以这样:

1. 任务面板手动跑 **`Memory Board: Watch Extension`**(esbuild 监听扩展端改动)
2. 改源码后,该任务自动增量重打包 `dist/extension.js`
3. EDH 窗口按 `Ctrl+R` 重载,新代码立即生效
4. ⚠️ 改了 GUI 还是得跑 `Build GUI` + `Build Webview (copy)`(GUI watch 也开了的话,Vite 会自动产出 dist,但**不会**自动拷贝到 `extensions/vscode/resources/webview`)

可选 watch 任务:`Watch Core`、`Watch GUI`、`Watch Extension`,**仅手动启动**,**不**作为 preLaunchTask(会永久挂起,见下文排错)。

---

## F5 的关键配置项详解

`launch.json` 当前完整配置(对应实际文件):

```jsonc
{
  "name": "启动扩展",
  "type": "extensionHost",
  "request": "launch",
  "runtimeExecutable": "${execPath}",
  "args": [
    "--extensionDevelopmentPath=${workspaceFolder}\\extensions\\vscode",
    "${env:USERPROFILE}\\.memory-board-dev-workspace"
  ],
  "outFiles": ["${workspaceFolder}/extensions/vscode/dist/**/*.js"],
  "preLaunchTask": "Memory Board: Build All (dev)",
  "sourceMaps": true,
  "debugWebviews": false,
  "debugWebWorkerHost": false
}
```

每一项的作用和踩坑记录:

| 字段 | 作用 | 关键提示 |
|---|---|---|
| `type: "extensionHost"` | VS Code 内置类型,启动 EDH 调试会话 | 由 js-debug 提供,无需安装任何扩展 |
| `runtimeExecutable: "${execPath}"` | 复用当前 VS Code 可执行文件 | 不显式指定时从 PATH 找 `code`,可能失败 |
| `args[0]: --extensionDevelopmentPath` | 显式指明真正的扩展源码目录 | ⚠️ **必须**指向 `extensions/vscode`(含扩展 package.json + `engines.vscode`)。误指 `${workspaceFolder}`(根 monorepo)会让 VS Code 当成扩展校验报"属性 engines.vscode 是必需的" |
| `args[1]: workspace path` | EDH 打开的工作区 | 改成项目绝对路径就能看真实 workspace 的 Copilot Memory |
| `outFiles` | js-debug 从 dist 反查 src | 路径必须跟 esbuild 输出一致:`extensions/vscode/dist/**/*.js`(不在根 `out/`) |
| `preLaunchTask` | F5 前自动跑的构建任务 | 必须是**同步退出**的任务(Build All);不能是 watch 任务(见排错) |
| `sourceMaps: true` | 扩展端 TS 断点生效的前提 | esbuild.config.mjs 已生成 sourcemap |
| `debugWebviews: false` | 关闭 webview 浏览器调试 | ⚠️ js-debug 1.96+ **默认 true**,会 attach Chrome/Edge 调 webview,被 Windows 弹窗策略拦截,弹"浏览器阻止了新窗口"对话框。必须显式关 |
| `debugWebWorkerHost: false` | 同上,关闭 web worker 调试 | 同上,必须显式关 |

---

## 历史踩坑记录

走过 4 个坑才稳定到当前配置,记录下来以备再次踩坑时参考。

### 坑 1:浏览器弹窗"浏览器阻止了新窗口"

**现象**:F5 后弹出对话框:
```
调试器需要为调试对象打开新选项卡或窗口，
但浏览器阻止了此选项卡或窗口。必须授予权限以继续。
```

**根因**:js-debug 1.96+ 在 `type: "extensionHost"` 下**默认** `debugWebviews: true` / `debugWebWorkerHost: true`,会启动 Chrome/Edge attach webview,被 Windows 弹窗策略拦截。

**修复**:`launch.json` 显式设 `debugWebviews: false` 和 `debugWebWorkerHost: false`。

误判过的尝试(无效):
- 删除 `webRoot`(其实是无关的)
- 改 `presentation.panel`(无关)

### 坑 2:加载报错"属性 engines.vscode 是必需的"

**现象**:EDH 弹窗:
```
未能加载正在开发的扩展 "e:\projects\vscode-copilot-memory-board"，
因为它无效: 属性"engines.vscode"是必需的，其类型必须是 'string'
```

**根因**:`args` 里 `--extensionDevelopmentPath=${workspaceFolder}` 错指仓库根目录。根 `package.json` 是 monorepo workspace 描述(无 `engines.vscode`),VS Code 把它当成扩展 package.json 校验失败。

**修复**:改成 `--extensionDevelopmentPath=${workspaceFolder}\extensions\vscode`(真正的扩展目录)。

### 坑 3:输出"问题匹配程序必须定义监视的开始模式和结束模式"

**现象**:F5 后底部 Output 输出这条错误。

**根因**:`tasks.json` 把 watch 任务设为 `isBackground: true` 时,`problemMatcher` 必须**同时**有 `beginsPattern` 和 `endsPattern`。我之前只配了 `beginsPattern`,触发了这个校验失败。

**修复**:**所有 watch 任务都用最简的 `problemMatcher: []`**,不为它们配 background pattern。
配套约束:**watch 任务不能作为 preLaunchTask**(否则 VS Code 等不到"任务就绪"信号永久挂起)。preLaunchTask 必须是同步退出的构建任务。

### 坑 4:F5 弹 EDH 但找不到代码

**现象**:EDH 窗口能弹出但 Memory Board 图标不出现 / 扩展没生效。

**根因**:
- `outFiles` 路径写错(写成 `${workspaceFolder}/out/**`) → js-debug 找不到 `dist/extension.js`
- 或 `runtimeExecutable` 没指定 → PATH 里没有 `code`

**修复**:`outFiles` 写 `${workspaceFolder}/extensions/vscode/dist/**/*.js`,`runtimeExecutable: ${execPath}`。

---

## 可用任务清单

`Ctrl+Shift+P` → `Tasks: Run Task`,可见:

| 任务 | 用途 | 是否常驻 |
|---|---|---|
| `Memory Board: Build All (dev)` | 全量构建 4 步,F5 自动跑 | 否 |
| `Memory Board: Build Core` | 单独构建 core(tsc) | 否 |
| `Memory Board: Build GUI` | 单独构建 gui(tsc + vite build) | 否 |
| `Memory Board: Build Webview (copy)` | 把 `gui/dist` 拷到 `extensions/vscode/resources/webview` | 否 |
| `Memory Board: Build Extension` | 单独 esbuild 打包扩展 bundle | 否 |
| `Memory Board: Watch Extension` | esbuild 增量监听扩展端改动 | 是 |
| `Memory Board: Watch GUI` | vite dev server(含磁盘中间件) | 是 |
| `Memory Board: Watch Core` | tsc -b --watch | 是 |
| `Memory Board: Clean` | 清理所有 dist + webview 资源 | 否 |
| `诊断版打包 VSIX` | 打包发布用 `.vsix` | 否 |

---

## 常见问题

### Q1: 按 F5 后 webview 显示 "GUI Not Built"

`extensions/vscode/resources/webview/index.html` 或 `assets/index.js` 缺失。手动跑 `Memory Board: Build All (dev)`,确认成功后再 F5。

### Q2: 改了 `core/src/types.ts` 后 webview 还看到旧字段

注意:**GUI typecheck 读 `core/dist`**(类型层面),所以 core 改类型后必须先 `pnpm --filter @memory-board/core build` 刷新 dist。
再走 webview 拷贝流程才能在 EDH 内看到运行时变化。
详见 `recursive-memory-scan.md` 反复提到的坑。

### Q3: Vite 构建时大量 "Module fs has been externalized" 警告

这是**预期行为**:`gui` 在浏览器环境运行时 `core/dist/memory-parser.js` 里的 Node API 会被 Vite externalize,运行时不调用;真实磁盘扫描由 `vite-plugin-memory-board.ts` 中间件在 dev server 端完成。可忽略。

### Q4: 想用 React DevTools 调前端

EDH 窗口内:`Ctrl+Shift+P` → `Developer: Open Webview Developer Tools`,会弹出 Chromium DevTools。




⭐ **推荐工作流**(频繁改动时):先在 Tasks 任务面板手动跑 `Memory Board: Watch All`(让 3 个 watch 常驻),再切到 launch 选 `Run Extension (with watch)` 按 F5。这样改扩展端/core 代码后只需 `Ctrl+R` 即可,无需重新构建。

> **注意**:Watch All 启动后,Vite 也会监听 `gui/src` 改动并重建 `gui/dist`,但**不会自动拷贝**到 `extensions/vscode/resources/webview/`。若改了前端代码,仍需手动跑一次 `Memory Board: Build Webview (copy)`。

## ⭐ CLI 启动 + 断点调试(推荐:F5 跑不通时用)

如果 F5(`type: "extensionHost"`)在你的环境中报错(如 `js-debug` 内置版本不识别、被浏览器策略拦、或新装 VS Code 没生效等),改用 **CLI 启动 + Attach 调试**,效果跟 F5 完全等价。

### 两步走流程

**第 1 步:启动 EDH**

任务面板 (`Ctrl+Shift+P` → `Tasks: Run Task`) → 选 **`Memory Board: Launch EDH via CLI`**

任务背后是这条命令:

```pwsh
code --extensionDevelopmentPath=e:\projects\vscode-copilot-memory-board\extensions\vscode `
     --inspect-brk-extensions=9339 `
     $env:USERPROFILE\.memory-board-dev-workspace
```

- `--extensionDevelopmentPath` — 加载未打包扩展(替代 F5 EDH 模式)
- `--inspect-brk-extensions=9339` — 开 9339 inspector 端口,且**初始暂停**(等 attach 后才加载扩展,可以调试 `activate` 流程)
- 任务先帮你在 `${userHome}/.memory-board-dev-workspace` 建好空白工作区目录

启动后弹出**带 "[Extension Development Host]"** 标题的独立 VS Code 窗口。

**第 2 步:在主 VS Code 里 Attach 调试器**

1. 在 `extensions/vscode/src/**/*.ts` 源码里按 F9 打红点断点(如 `webview-provider.ts` 的 `handleMessage` 函数)
2. Run and Debug 面板 → 选 **`Attach to EDH Extension Host`** → 按 F5
3. 主 VS Code 状态栏出现红/橙色调试指示器,attach 完成
4. 在 EDH 窗口内触发对应操作(点击 Memory Board 图标、切换排序、钉选等)→ **命中断点**

### CLI + Attach 调试的限制与注意

| 项 | 说明 |
|---|---|
| 可调试范围 | 扩展端 TypeScript(`extensions/vscode/src/**`);通过 esbuild sourcemap 反向定位 |
| 不可调试 | 前端 React(用 EDH 窗口的 webview DevTools,见下文) |
| inspect-brk 行为 | 首次 attach 时会停在一个内部 import 句,按 F5 继续;之后才能触发业务断点 |
| EDH 重启(Ctrl+R) | 需要在主 VS Code 再次按 F5 Attach 重连(调试会话不自动续接) |
| 关闭 EDH 窗口后 | Attach 调试会话自动结束 |

### 跟 F5 对比

| 维度 | F5 extensionHost | CLI + Attach |
|---|---|---|
| 配置简单 | ✅ 一键 | ⚖️ 两步(启 EDH + 附加) |
| 断点调试扩展源码 | ✅ 自动附加 | ✅ 手动 Attach 后生效 |
| 断点调试 `activate` 流程 | ✅配 stopOnEntry | ✅ inspect-brk 保证 |
| 兼容性 | 依赖 js-debug 内置可用 | 兼容性更广,稳定 |
| 重载荷调试 | ✅ | ✅ |



## 可用任务列表

打开 `Ctrl+Shift+P` → `Tasks: Run Task`,可见:

| 任务 | 用途 |
|---|---|
| `Memory Board: Build All (dev)` | 全量构建(core + gui + webview copy + ext bundle),F5 时会自动跑 |
| `Memory Board: Build Core` | 仅构建 core(tsc) |
| `Memory Board: Build GUI` | 仅构建 gui(vite build) |
| `Memory Board: Build Webview (copy)` | 仅把 `gui/dist` 拷到 `extensions/vscode/resources/webview` |
| `Memory Board: Build Extension` | 仅构建扩展 esbuild bundle |
| `Memory Board: Watch All` | 并行常驻监听 3 处变化(core tsc / gui vite / ext esbuild --watch) |
| `Memory Board: Clean` | 清理所有 dist / webview 资源(遇诡异缓存时用) |
| `诊断版打包 VSIX` | 打包出发布用 `.vsix`(原有保留) |

## 常见问题

### Q1: 按 F5 后 webview 显示 "GUI Not Built"

表示 `resources/webview/index.html` 或 `assets/index.js` 缺失。先手动跑 `Memory Board: Build All (dev)`,确认成功后再 F5。

### Q2: 改了 `core/src/types.ts` 但前端 webview 看不到新字段

注意:**GUI typecheck 会读 `core/dist`**(类型层面),所以 core 改类型后必须 `pnpm --filter @memory-board/core build` 刷新 dist。这条已在 `recursive-memory-scan.md` 反复提到。

同时还要走 webview 拷贝流程才能在 EDH 内看到运行时变化。

### Q3: Vite 构建时大量 "Module fs has been externalized for browser..." 警告

这是**预期行为**:`gui` 在浏览器环境运行时 `core/dist/memory-parser.js` 里的 Node API 会被 Vite externalize,运行时不调用;真实磁盘扫描由 `vite-plugin-memory-board.ts` 中间件在 dev server 端完成。可忽略。

### Q4: 想看 React DevTools

EDH 窗口内运行命令 `Developer: Open Webview Developer Tools`,会弹出 Chromium DevTools。
