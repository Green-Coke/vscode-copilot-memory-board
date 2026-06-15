// ============================================================================
// SortControl — 统一的排序切换控件
// ----------------------------------------------------------------------------
// 被仓库列表、session 列表、文件树头部共用，负责切换排序字段与方向。
// 通过 data-testid 暴露稳定锚点，便于 Playwright 断言当前排序状态。
// ============================================================================

import { ArrowUp, ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";
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

/**
 * 根据当前 i18n 实例动态生成本次渲染的排序字段标签映射。
 * 原先存在模块顶层的 FieldLabels 常量里包含中文文案，i18n 后必须改为函数获取（依赖 t）。
 */
function createFieldLabels(t: (key: string) => string): Record<SortBy, string> {
  return {
    name: t("sort.field.name"),
    createdAt: t("sort.field.created"),
    updatedAt: t("sort.field.updated"),
  };
}

/**
 * 渲染一个紧凑的排序下拉 + 方向切换组合。
 * 左侧的原修饰图标被替换为具有实际功能的切换升降序按钮，
 * 该按钮包含 ArrowUp 与 ArrowDown 两个箭头，根据正序/倒序状态分别高亮。
 */
export function SortControl({
  value,
  onChange,
  availableFields = DEFAULT_FIELDS,
  testIdScope,
}: SortControlProps) {
  const { t } = useTranslation();
  const fields = availableFields;
  const fieldLabels = createFieldLabels(t);

  /**
   * 切换排序方向的处理函数
   * 将升序切换为降序，或降序切换为升序
   */
  const handleToggleDirection = () => {
    onChange({
      ...value,
      direction: value.direction === "asc" ? "desc" : "asc",
    });
  };

  return (
    <div
      data-testid={`sort-control-${testIdScope}`}
      className="flex items-center gap-1 font-mono text-[10px] text-text-secondary select-none"
    >
      {/* 排序字段下拉选择器：优先显示在左侧 */}
      <select
        data-testid={`sort-by-${testIdScope}`}
        aria-label={t("sort.aria")}
        value={value.by}
        onChange={(e) => {
          const next = e.target.value as SortBy;
          // 切换字段时的默认排序方向优化：
          // 名称(name)默认升序 asc (符合 A-Z 人类习惯)
          // 时间(createdAt/updatedAt)默认降序 desc (优先展示最新记录)
          onChange({ by: next, direction: next === "name" ? "asc" : "desc" });
        }}
        className="bg-surface-2 border border-border-default rounded px-1.5 py-1 text-text-primary cursor-pointer outline-none focus:border-brand-indigo transition-colors"
      >
        {fields.map((field) => (
          <option key={field} value={field}>
            {fieldLabels[field]}
          </option>
        ))}
      </select>

      {/* 排序方向切换按钮：放置在右侧 */}
      <button
        data-testid={`sort-direction-${testIdScope}`}
        type="button"
        onClick={handleToggleDirection}
        title={value.direction === "asc" ? t("sort.tooltip.ascending") : t("sort.tooltip.descending")}
        className="p-1 rounded border border-border-default bg-surface-2 hover:border-brand-indigo cursor-pointer flex items-center gap-0.5 transition-colors shrink-0"
      >
        <ArrowUp
          className={cn(
            "w-3 h-3 transition-colors",
            value.direction === "asc"
              ? "text-brand-indigo font-bold"
              : "text-text-muted opacity-30"
          )}
        />
        <ArrowDown
          className={cn(
            "w-3 h-3 transition-colors",
            value.direction === "desc"
              ? "text-brand-indigo font-bold"
              : "text-text-muted opacity-30"
          )}
        />
      </button>
    </div>
  );
}
