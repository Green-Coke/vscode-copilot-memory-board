# Webview i18n 多语言接入指南（i18next + react-i18next）

## 概述

本项目已接入完整的多语言切换：webview 界面文本完全根据 VS Code 当前显示语言（`vscode.env.language`）或浏览器 `navigator.language`（standalone 模式）动态切换。

**支持语言**：`zh-cn` / `en`，`fallbackLng: en`。

## 架构原理（与主题注入对比）

| 维度 | 主题（dark/light） | 语言（zh-cn/en） |
|------|------------------|-----------------|
| 注入源 | VS Code 运行时自动注入 `body.vscode-*` class + CSS 变量 | **不会自动注入** — 必须扩展端主动推送 |
| 协议路径 | 不走协议（运行时直接生效） | 复用 `GetUiPreferencesResponse.payload.language` 字段 |
| 切换时序 | 有 `window.onDidChangeActiveColorTheme` 实时事件 | VS Code 切语言必然重启→webview 重建，**无运行时事件** |
| 初始化时机 | main.tsx 同步检测（standalone 注入 `body.theme-macaron`） | main.tsx 同步 import "./i18n"，触发 i18next 初始化并读 navigator.language |

**关键差异**：语言注入需要扩展端+协议层协作，主题不需要。

## 关键文件与流程

### 数据流（启动期一次性）
```
1) main.tsx: 副作用 import "./i18n"
   └─ i18next.init()，按 navigator.language 选默认语言（standalone）
   VS Code 模式默认 en，等异步协议覆盖

2) React 启动 → useUiPreferences() 发 getUiPreferences 请求
   ↓
3) 扩展端 GET_UI_PREFERENCES 分支（webview-provider.ts L601-616）
   response.payload.language = vscode.env.language
   ↓
4) use-bridge.ts useUiPreferences 收到 payload.language
   └─ i18n.changeLanguage(isSupportedLocale(payload.language))
   └─ document.documentElement.lang 同步
   ↓
5) react-i18next 触发所有用 useTranslation() 的组件 re-render
```

### 文件清单
- `gui/src/i18n/index.ts` — i18n 单例、`isSupportedLocale()`、`syncHtmlLang`
- `gui/src/i18n/locales/en.ts` — 英文字典
- `gui/src/i18n/locales/zh-cn.ts` — 中文字典（保留现有中文文案）
- `gui/src/hooks/use-bridge.ts` — `useUiPreferences()` 中调 `i18n.changeLanguage()`
- `core/src/protocol.ts` — `GetUiPreferencesResponse.payload.language?` 字段
- `extensions/vscode/src/webview-provider.ts` — `GET_UI_PREFERENCES` 分支注入 `vscode.env.language`

## 如何新增一条翻译

### 1. 在两个 locale 文件中同步加键

```ts
// en.ts
{
  my: {
    feature: {
      label: "Click me",
      tooltip: "Click to trigger action",
    },
  },
}

// zh-cn.ts （结构必须与 en.ts 完全一致，TS 类型校验）
{
  my: {
    feature: {
      label: "点击我",
      tooltip: "点击触发操作",
    },
  },
}
```

### 2. 在组件中使用

```tsx
import { useTranslation } from "react-i18next";

export function MyComponent() {
  const { t } = useTranslation();
  return (
    <button title={t("my.feature.tooltip")}>
      {t("my.feature.label")}
    </button>
  );
}
```

### 3. 带插值（i18next 原生语法 `{name}`）

```ts
// en.ts: "Hello {{name}}"
// zh-cn.ts: "你好 {{name}}"

t("common.greeting", { name: "Alice" });
// ↳ en: "Hello Alice"
// ↳ zh-cn: "你好 Alice"
```

不需要 ICU MessageFormat 插件。

## 三个关键陷阱

### 陷阱 1：不要用翻译字符串做逻辑判断

**错误**（i18n 前能跑、i18n 后必坏）：
```tsx
const shouldHide = panelTitle === "工作区";
```

**正确**：用独立 prop 标识：
```tsx
interface PanelProps { hideTitle?: boolean; ... }
const shouldHide = hideTitle;
```

本项目 Panel 已按这个模式重构（`App.tsx` 传 `hideTitle`，`Layout.tsx` 接收）。

### 陷阱 2：模块顶层的常量不要包含翻译值

**错误**：
```ts
const FIELD_LABELS = { name: "名称", createdAt: "创建时间" }; // ❌ 静态固化
```

**正确**：工厂函数（依赖 `t` 时重算）：
```ts
function createFieldLabels(t) {
  return { name: t("sort.field.name"), createdAt: t("sort.field.created") };
}

export function Component() {
  const { t } = useTranslation();
  const fieldLabels = createFieldLabels(t); // 每次 render 重算
}
```

参考 `SortControl.tsx`。

### 陷阱 3：useCallback deps 数组别忘了 `t`

```tsx
const handleAction = useCallback((action) => {
  // ...用了 t(...)
}, [..., t]); // ← t 必须加进 deps，否则 React 警告违反 exhaustive-deps
```

### 陷阱 4：🚨 i18next v26 locale 大小写匹配 bug（最坑的）

**症状**：`i18n.language` 报告正确（"zh-cn"），但界面依然显示英文。

**根因**：i18next 用 locale 作资源查表 key 时**区分大小写**。浏览器 `navigator.language`、VS Code `vscode.env.language` 都可能返回大写形式（如 `"zh-CN"`）。i18next 把传入 lng 拆成 fallback 序列时，其中的 region 部分会按 BCP 47 规范转为大写：`lng: "zh-cn"` → `i18n.languages = ["zh-CN", "zh", "en"]`（注意是 `zh-CN` 大写）。若只注册小写 `"zh-cn"` 资源，查表第一个 key `"zh-CN"` 找不到 → fallback "en" → **显示英文**。

**诊断**：
```js
// 注意是 i18n.languages（复数），不是 i18n.language！
console.log(i18n.languages);           // ["zh-CN", "zh", "en"]
console.log(i18n.resolvedLanguage);    // 错误地是 "en"
console.log(i18n.language);            // "zh-cn"（有迷惑性）
i18n.getDataByLanguage('zh-cn')        // 资源确实存在
```

**修复**：同时注册大写 `"zh-CN"` 和小写 `"zh-cn"` 两个 casing 别名指向同一份资源。

```ts
// gui/src/i18n/index.ts
resources: {
  en: { translation: en },
  "zh-cn": { translation: zhCn },
  "zh-CN": { translation: zhCn }, // ← 关键！
}
```

## isSupportedLocale 语言降级规则

`vscode.env.language` 可能返回 `"zh-cn"` / `"en"` / `"en-US"` / `"zh-tw"` 等任意 locale。

```ts
isSupportedLocale("zh-cn")    // → "zh-cn"
isSupportedLocale("zh-CN")    // → "zh-cn" （大小写不敏感）
isSupportedLocale("zh-tw")    // → "zh-cn" （繁体降级到简体，未支持 zh-tw）
isSupportedLocale("zh")       // → "zh-cn"
isSupportedLocale("en")       // → "en"
isSupportedLocale("en-US")    // → "en"
isSupportedLocale("fr")       // → "en" （法语等一律 fallback）
isSupportedLocale(undefined)  // → "en"
```

## 验证步骤

1. **类型检查**：`cd gui && pnpm typecheck`
2. **构建**：`cd gui && pnpm build`（Vite 把所有翻译键内联打包）
3. **VS Code 中文环境**：F5 启动 → 界面应保留全部中文
4. **VS Code 英文环境**：临时切换 Display Language 到 English 重启 → 界面全英文
5. **standalone 浏览器**：`cd gui && pnpm dev`，跟随 `navigator.language`
6. **`<html lang>` 同步**：浏览器 DevTools 检查 `document.documentElement.lang` 应是 `zh-cn` / `en` 之一

## 未来扩展

- 添加新语言（如 `zh-tw`）：
  1. 新建 `gui/src/i18n/locales/zh-tw.ts`
  2. 在 `index.ts` 的 `resources` 与 `isSupportedLocale` 中加映射
  3. 如键量大（>5 种语言），改用 `i18next-http-backend` 按需 lazy load
- 复数处理：当前都是 `{{count}}` 简单插值；若需要"1 item/2 items"区分，再装 `i18next-icu`

## 参考文档

- [VS Code env.language API](https://code.visualstudio.com/api/references/vscode-api#env)
- [i18next 官方文档](https://www.i18next.com/)
- [react-i18next useTranslation](https://react.i18next.com/latest/usetranslation-hook)
