import React from "react";
import { cn } from "@/lib/utils";

/**
 * 下拉选择框的单选项接口定义
 */
export interface SelectOption {
  /** 选项的实际值 */
  value: string;
  /** 选项展示的文本标签 */
  label: string;
}

/**
 * 自定义 Select 下拉选择组件的 Props 定义
 */
interface CustomSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  /** 选项数组 */
  options: SelectOption[];
  /** 值改变时的回调 */
  onValueChange?: (value: string) => void;
}

/**
 * 通用、美观的下拉选择框组件。
 * 该组件在 Workspaces 栏的 IDE 重定向目标选择以及 AppHeader 扫描目标选择中实现共享。
 */
export function CustomSelect({
  options,
  value,
  onValueChange,
  className,
  ...props
}: CustomSelectProps) {
  // 处理下拉框选择改变的事件并触发外部回调
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onValueChange?.(e.target.value);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className={cn(
        "bg-surface-2 border border-border-default rounded px-2 py-0.5 text-[10px] font-mono text-text-primary outline-none focus:border-brand-indigo/60 transition-colors cursor-pointer",
        className
      )}
      {...props}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-surface-2 text-text-primary">
          {opt.label}
        </option>
      ))}
    </select>
  );
}
