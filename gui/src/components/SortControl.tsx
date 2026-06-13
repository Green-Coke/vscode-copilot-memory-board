// ============================================================================
// SortControl — 统一的排序切换控件
// ----------------------------------------------------------------------------
// 被仓库列表、session 列表、文件树头部共用，负责切换排序字段与方向。
// 通过 data-testid 暴露稳定锚点，便于 Playwright 断言当前排序状态。
// ============================================================================

import { ChevronDown, ChevronUp, ArrowDownUp } from "lucide-react";
import type { SortBy, SortOption } from "@memory-board/core";
import { cn } from "@/lib/utils";

interface SortControlProps {
  /** 当前排序选项 */
  value: SortOption;
  /** 排序变化时的回调 */
  onChange: (next: SortOption) => void;
  /** 允许选择的排序字段；仓库/session 排除 updatedAt，文件树保留全部 */
  availableFields?: SortBy[];
  /** 用于 data-testid 的作用域标识，例如 "repo" / "session" / "file-tree" */
  testIdScope: string;
}

/** 默认允许字段：名称与创建时间 */
const DEFAULT_FIELDS: SortBy[] = ["name", "createdAt"];

/** 字段中文标签 */
const FIELD_LABELS: Record<SortBy, string> = {
  name: "名称",
  createdAt: "创建时间",
  updatedAt: "更新时间",
};

/**
 * 渲染一个紧凑的排序下拉 + 方向切换组合，样式与原 cyber-input 保持一致
 */
export function SortControl({
  value,
  onChange,
  availableFields = DEFAULT_FIELDS,
  testIdScope,
}: SortControlProps) {
  const fields = availableFields;

  return (
    <div
      data-testid={`sort-control-${testIdScope}`}
      className="flex items-center gap-1 font-mono text-[10px] text-text-secondary select-none"
    >
      <ArrowDownUp className="w-3 h-3 text-text-muted" />
      <select
        data-testid={`sort-by-${testIdScope}`}
        aria-label="排序字段"
        value={value.by}
        onChange={(e) => {
          const next = e.target.value as SortBy;
          // 切换字段时默认升序，保持可预期
          onChange({ by: next, direction: "asc" });
        }}
        className="bg-surface-2 border border-border-default rounded px-1.5 py-1 text-text-primary cursor-pointer outline-none focus:border-brand-indigo transition-colors"
      >
        {fields.map((field) => (
          <option key={field} value={field}>
            {FIELD_LABELS[field]}
          </option>
        ))}
      </select>
      <button
        data-testid={`sort-direction-${testIdScope}`}
        type="button"
        onClick={() =>
          onChange({
            ...value,
            direction: value.direction === "asc" ? "desc" : "asc",
          })
        }
        title={value.direction === "asc" ? "当前升序，点击切换为降序" : "当前降序，点击切换为升序"}
        className="p-1 rounded border border-border-default bg-surface-2 hover:border-brand-indigo text-text-secondary hover:text-brand-indigo cursor-pointer flex items-center justify-center transition-colors"
      >
        {value.direction === "asc" ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
