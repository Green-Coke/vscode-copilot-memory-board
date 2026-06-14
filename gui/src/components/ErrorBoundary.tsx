// ============================================================================
// ErrorBoundary — 通用错误边界
// ============================================================================
// React 默认情况下：任意子组件抛出未捕获错误会让整棵树卸载，导致界面只剩背景色。
// 本边界用于包裹 MemoryViewer 等关键面板，捕获渲染阶段的异常，渲染用户友好的提示，
// 并在错误时清空内部状态（点击「重试」按钮可强制刷新）。
//
// 注意：React 19 仍然使用 class component 实现错误边界（hooks 暂不支持）。
// ============================================================================

import React from "react";

interface ErrorBoundaryProps {
  /** 子元素；任意子树抛错都会被捕获 */
  children: React.ReactNode;
  /** 自定义错误回退渲染；不传则使用默认样式 */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  /** 错误回调（用于日志上报、调试） */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 通用错误边界组件。
 *
 * 用法：
 * ```tsx
 * <ErrorBoundary>
 *   <MemoryViewer ... />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  // 捕获子树渲染阶段抛出的错误；返回新 state 触发错误回退 UI
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // 默认打印到控制台便于调试；外部可传 onError 做日志上报
    console.error("[ErrorBoundary] 捕获到渲染异常：", error, info);
    this.props.onError?.(error, info);
  }

  /**
   * 重置错误状态并重新挂载子树（用户点击「重试」时触发）。
   */
  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }
    return <DefaultErrorFallback error={error} onReset={this.reset} />;
  }
}

/**
 * 默认的错误回退面板，匹配现有 Memory Board 暗色风格。
 */
function DefaultErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-surface-2/10">
      <div className="relative w-16 h-16 mb-4 flex items-center justify-center text-status-error/60">
        <svg
          viewBox="0 0 100 100"
          className="w-12 h-12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M50 15 L90 80 L10 80 Z" />
          <line x1="50" y1="38" x2="50" y2="58" />
          <circle cx="50" cy="68" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider font-display">
        面板渲染失败
      </h3>
      <p className="text-[11px] text-text-muted mt-1.5 max-w-[280px] leading-relaxed">
        渲染过程中发生异常。可能是数据格式异常（例如旧版扩展/standalone 服务返回了
        不兼容的字段），重启 standalone dev server 后通常能解决。
      </p>
      <pre className="mt-3 max-w-[400px] text-[10px] text-status-error/80 bg-surface-3/30 rounded p-2 overflow-auto text-left font-mono">
        {error.message}
        {error.stack ? `\n${error.stack.split("\n").slice(0, 3).join("\n")}` : ""}
      </pre>
      <button
        onClick={onReset}
        className="mt-4 px-3 py-1.5 text-[11px] font-semibold rounded border border-border-default bg-surface-3/40 hover:bg-surface-3/70 text-text-primary transition-colors cursor-pointer"
      >
        重试
      </button>
    </div>
  );
}
