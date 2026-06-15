// ============================================================================
// i18n — 初始化 + 默认语言解析 + 语言映射辅助
// ============================================================================
// 设计要点：
//
// 1. 与项目双入口兼容：
//    - VS Code Webview 模式：通过 useUiPreferences() 拿到 vscode.env.language 后调用
//      i18n.changeLanguage() 动态切换。
//    - Standalone 浏览器模式：在初始化时根据 navigator.language 直接选定默认语言。
//    - 本文件不依赖 @memory-board/core 的协议，纯 i18next 配置，便于副作用 import。
//
// 2. 资源内联打包（不 lazy load）：
//    全部翻译资源（~55 键 × 2 语言）直接 import，预算约 5-10KB。
//    未来扩展到 5+ 语言时再考虑 i18next-http-backend 按需加载。
//
// 3. 插值：使用 i18next 原生 {name} 语法，不引入 i18next-icu。
//
// 4. 语言降级：所有 zh* 开头的 locale 映射到 zh-cn，其它一律 fallback 到 en。
//
// 5. <html lang> 自动同步：通过监听 languageChanged 事件设置
//    document.documentElement.lang，保证无障碍工具能拿到正确语言。
// ============================================================================

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import zhCn from "./locales/zh-cn";

/** 当前支持的翻译资源 locale 标识 */
export type SupportedLocale = "en" | "zh-cn";

/** VS Code/浏览器返回的原始 locale 标识（如 "zh-cn" / "en" / "en-US" / "zh-tw"） */
export type RawLocale = string;

/**
 * 把任意原始 locale 映射到 SupportedLocale 之一。
 * 规则（用户决策：不预留繁体）：
 *   - "zh" 前缀   → "zh-cn"（zh-tw / zh-hk 等简体之外的中文一律降级到 zh-cn）
 *   - 其它（含 undefined / 空串） → "en"
 */
export function isSupportedLocale(locale: RawLocale | undefined | null): SupportedLocale {
  if (!locale) return "en";
  const lower = locale.toLowerCase();
  // zh*（含 zh-cn / zh-tw / zh-hk / zh-CN 等）一律映射到 zh-cn
  if (lower === "zh" || lower.startsWith("zh-") || lower.startsWith("zh_")) return "zh-cn";
  // en-US / en-GB 等一律映射到 en
  return "en";
}

/**
 * 根据运行时环境推断默认 locale：
 *   - Standalone 浏览器：navigator.language
 *   - VS Code Webview：暂返回 "en" 兜底，由 useUiPreferences() 拿到实际语言后覆盖
 */
function detectInitialLocale(): SupportedLocale {
  // acquireVsCodeApi 是 VS Code Webview 注入的全局函数
  const isVsCode = typeof (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === "function";
  if (!isVsCode && typeof navigator !== "undefined" && navigator.language) {
    return isSupportedLocale(navigator.language);
  }
  // VS Code 模式：默认 en，等 useUiPreferences 拿到 vscode.env.language 后再切换
  return "en";
}

// 初始化 i18next
// 注意：这是顶层副作用调用，由 main.tsx 的 `import "./i18n"` 触发，
// 保证 React 首次渲染之前 i18n 已就绪。
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-cn": { translation: zhCn },
    // 同时注册大写规范名 "zh-CN" 作别名。
    //
    // 原因（关键 bug）：i18next v26 的 fallback 查找会把传入的 lng 拆分成
    // [locale, language-part, fallback] 的查询序列；浏览器 navigator.language 实际返回
    // 的是 "zh-CN"（大写），VS Code env.language 也可能是 "zh-CN"。
    //
    // 而 i18next 用 locale 作资源查表 key 时区分大小写。若只注册小写 "zh-cn"，
    // 当 i18n.languages = ["zh-CN", "zh", "en"] 时第一个查表 key 是 "zh-CN"，
    // 找不到 → 第二个 "zh" 也没有 → fallback "en"，最终错误地显示英文。
    //
    // 因此 MUST 同时注册大小写两种 casing，确保无论上游传入什么 casing 都能命中 zhCn 资源。
    "zh-CN": { translation: zhCn },
  },
  lng: detectInitialLocale(),
  fallbackLng: "en",
  // React 19 已对插入的内容做转义，i18next 不需要再 escape
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

// 语言切换时同步 <html lang> 用于无障碍/屏幕阅读器
function syncHtmlLang(lng: string): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
}

syncHtmlLang(i18n.language);
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
