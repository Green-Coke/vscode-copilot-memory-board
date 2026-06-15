// ============================================================================
// PinnedButton — 钉选切换按钮
// ----------------------------------------------------------------------------
// 在仓库列表和 session 列表项中复用，控制某一项是否钉选。
// 钉选后该项会被置顶显示。通过 data-testid 暴露稳定锚点供 Playwright 断言。
// ============================================================================

import { Pin, PinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface PinnedButtonProps {
  /** 当前是否已钉选 */
  pinned: boolean;
  /** 点击钉选/取消钉选时的回调 */
  onClick: (nextPinned: boolean) => void;
  /** 用于 data-testid 的作用域标识，例如 "repo" / "session" */
  testIdScope: string;
  /** 可选的条目 ID 后缀；若提供会拼到 testid 中以便 Playwright 精确定位 */
  itemId?: string;
}

/**
 * 渲染一个钉选/取消钉选的小图标按钮
 */
export function PinnedButton({
  pinned,
  onClick,
  testIdScope,
  itemId,
}: PinnedButtonProps) {
  const { t } = useTranslation();
  const testId = itemId
    ? `pin-${testIdScope}-${itemId}`
    : `pin-${testIdScope}`;

  return (
    <button
      data-testid={testId}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(!pinned);
      }}
      title={pinned ? t("pinned.unpin") : t("pinned.pinToTop")}
      aria-pressed={pinned}
      className={cn(
        "p-1 rounded cursor-pointer flex items-center justify-center transition-all duration-200 shrink-0",
        pinned
          ? "text-amber-500 hover:text-amber-600 bg-amber-500/10 border border-amber-500/30"
          : "text-text-muted hover:text-amber-500 border border-transparent hover:bg-surface-3/50"
      )}
    >
      {pinned ? <Pin className="w-3.5 h-3.5 fill-amber-500/30" /> : <PinOff className="w-3.5 h-3.5" />}
    </button>
  );
}
