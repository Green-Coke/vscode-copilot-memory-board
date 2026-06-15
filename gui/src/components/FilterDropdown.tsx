// ============================================================================
// FilterDropdown — 通用列表过滤下拉菜单组件
// ----------------------------------------------------------------------------
// 支持单项开关过滤、重置过滤等功能，并与 Radix DropdownMenu 和项目的 Cyber 风格集成。
// ============================================================================

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Filter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface FilterDropdownProps {
  /** 主选项文案，例如 "只展示有记忆的工作区" */
  label: string;
  /** 当前过滤是否启用 */
  checked: boolean;
  /** 切换过滤（回写持久层） */
  onToggle: (next: boolean) => void;
  /** 用于 data-testid 的范围标识，例如 "workspace" / "session" */
  testIdScope?: string;
}

/**
 * 封装 Radix DropdownMenu 的通用过滤入口组件
 * 提供一个带状态指示的过滤图标按钮以及微缩毛玻璃菜单浮层
 */
export function FilterDropdown({
  label,
  checked,
  onToggle,
  testIdScope = "default",
}: FilterDropdownProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu.Root>
      {/* 触发按钮：采用 cyber 风格，启用过滤时高亮且带微弱点状指示 */}
      <DropdownMenu.Trigger asChild>
        <button
          data-testid={`filter-trigger-${testIdScope}`}
          type="button"
          aria-label={t("filter.aria")}
          className={cn(
            "p-1.5 rounded cursor-pointer flex items-center justify-center transition-all duration-200 shrink-0 border relative",
            checked
              ? "text-brand-indigo hover:text-brand-indigo bg-brand-indigo/10 border-brand-indigo/40 shadow-[0_0_8px_var(--ui-glow-primary)]"
              : "text-text-muted hover:text-brand-indigo border-transparent hover:bg-surface-3/50"
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          
          {/* 激活状态下的微弱 dot 指示 */}
          {checked && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-indigo shadow-[0_0_4px_var(--ui-glow-primary)]" />
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        {/* 菜单内容：采用毛玻璃质感风格，并适配 VS Code 主题边界检测 */}
        <DropdownMenu.Content
          align="end"
          sideOffset={5}
          className={cn(
            "min-w-[200px] py-1.5 px-1.5",
            "rounded-lg border border-border-default/60",
            "bg-surface-1/95 backdrop-blur-md",
            "shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
            "z-[9999]",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
        >
          {/* 主过滤项 */}
          <DropdownMenu.Item
            data-testid={`filter-option-${testIdScope}`}
            onSelect={() => onToggle(!checked)}
            className={cn(
              "flex items-center gap-2 pl-3 pr-3.5 py-1.5 text-[11px] font-mono rounded-sm cursor-pointer",
              "outline-none select-none transition-colors",
              "text-text-secondary hover:bg-surface-3/60 focus:bg-surface-3/60 hover:text-text-primary"
            )}
          >
            {/* 勾选标记：仅在 checked 状态下渲染，占位宽保持对齐 */}
            <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              {checked && <span className="text-brand-indigo font-bold text-xs">✓</span>}
            </span>
            <span className="flex-1 truncate">{label}</span>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="h-px bg-border-subtle/40 my-1 mx-2" />

          {/* 重置项 */}
          <DropdownMenu.Item
            data-testid={`filter-reset-${testIdScope}`}
            disabled={!checked}
            onSelect={() => onToggle(false)}
            className={cn(
              "flex items-center gap-2 pl-3 pr-3.5 py-1.5 text-[11px] font-mono rounded-sm cursor-pointer",
              "outline-none select-none transition-colors",
              !checked
                ? "text-text-muted/40 cursor-not-allowed"
                : "text-text-secondary hover:bg-surface-3/60 focus:bg-surface-3/60 hover:text-text-primary"
            )}
          >
            {/* 占位符以对齐文字 */}
            <span className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">{t("common.resetFilter")}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
