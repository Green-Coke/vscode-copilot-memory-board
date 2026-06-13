// ============================================================================
// sort-utils — 通用列表与文件树排序工具
// ----------------------------------------------------------------------------
// 为仓库列表、session 列表、文件树提供统一的排序能力。
// 排序字段：name / createdAt / updatedAt；方向：asc / desc。
// 当时间字段缺失时（例如真实数据未提供 createdAt / 文件树缺失态）回退到名称排序，
// 同名再回退到原顺序，保证稳定。
// ============================================================================

import type { SortOption } from "@memory-board/core";
import type { MockFsNode } from "@/lib/mock-filetree";

/**
 * 通用排序输入：需要可获取名称和可选时间字段
 */
export interface SortableItem {
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 比较两个 ISO 时间字符串，缺失或非法值按 0 处理。
 * @returns 负数表示 a 早于 b，正数表示 a 晚于 b
 */
function compareTime(a?: string, b?: string): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
  return ta - tb;
}

/**
 * 根据排序选项，返回一个稳定比较函数用于 Array#sort。
 *
 * - "name"：按 name 本地化比较（不区分大小写）
 * - "createdAt"：按 createdAt 比较；缺失时回退到 name
 * - "updatedAt"：按 updatedAt 比较；缺失时回退到 createdAt；再缺失回退到 name
 *
 * 排序方向由 direction 决定，时间倒序通常意味着“最新在前”。
 */
export function makeComparator<T extends SortableItem>(
  option: SortOption
): (a: T, b: T) => number {
  const dir = option.direction === "desc" ? -1 : 1;

  return (a, b) => {
    let cmp = 0;

    if (option.by === "createdAt") {
      const hasA = typeof a.createdAt === "string";
      const hasB = typeof b.createdAt === "string";
      if (hasA && hasB) {
        cmp = compareTime(a.createdAt, b.createdAt);
      } else if (hasA !== hasB) {
        // 有时间的排在前面（按方向调整），避免时间缺失的项扰乱顺序
        cmp = hasA ? 1 : -1;
      }
    } else if (option.by === "updatedAt") {
      const hasA = typeof a.updatedAt === "string";
      const hasB = typeof b.updatedAt === "string";
      if (hasA && hasB) {
        cmp = compareTime(a.updatedAt, b.updatedAt);
      } else if (hasA !== hasB) {
        cmp = hasA ? 1 : -1;
      } else if (a.createdAt && b.createdAt) {
        cmp = compareTime(a.createdAt, b.createdAt);
      }
    }

    // 时间相等或按 name 排序时，使用名称本地化比较
    if (cmp === 0) {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }

    return cmp * dir;
  };
}

/**
 * 对一个普通列表进行排序的快捷方法，返回新数组（不改原数组）。
 *
 * @param items 待排序列表
 * @param option 排序选项
 * @param getName 可选的名称提取器；默认使用 `item.name`，
 *                对 Session 这类用 title 字段的类型可通过它来适配
 */
export function sortItems<T>(
  items: readonly T[],
  option: SortOption,
  getName: (item: T) => string = (item) => (item as unknown as SortableItem).name
): T[] {
  const comparator = makeComparatorForT(getName, option);
  return [...items].sort(comparator);
}

/**
 * 针对自定义业务类型构造比较器，避免强制要求业务类型实现 SortableItem
 */
function makeComparatorForT<T>(
  getName: (item: T) => string,
  option: SortOption
): (a: T, b: T) => number {
  const dir = option.direction === "desc" ? -1 : 1;

  return (a, b) => {
    let cmp = 0;
    const ta = (a as unknown as SortableItem).createdAt;
    const tb = (b as unknown as SortableItem).createdAt;
    const ua = (a as unknown as SortableItem).updatedAt;
    const ub = (b as unknown as SortableItem).updatedAt;

    if (option.by === "createdAt") {
      const hasA = typeof ta === "string";
      const hasB = typeof tb === "string";
      if (hasA && hasB) {
        cmp = compareTime(ta, tb);
      } else if (hasA !== hasB) {
        // 有时间的排在前面（按方向调整），避免时间缺失的项扰乱顺序
        cmp = hasA ? 1 : -1;
      }
    } else if (option.by === "updatedAt") {
      const hasA = typeof ua === "string";
      const hasB = typeof ub === "string";
      if (hasA && hasB) {
        cmp = compareTime(ua, ub);
      } else if (hasA !== hasB) {
        cmp = hasA ? 1 : -1;
      } else if (ta && tb) {
        cmp = compareTime(ta, tb);
      }
    }

    // 时间相等或按 name 排序时，使用名称本地化比较
    if (cmp === 0) {
      cmp = getName(a).localeCompare(getName(b), undefined, { sensitivity: "base" });
    }

    return cmp * dir;
  };
}

/**
 * 递归排序文件树：对每一层 children 都按相同排序选项排序，返回新树。
 * 目录与文件混合排序，保持原有父子结构不变。
 */
export function sortFileTree(
  nodes: readonly MockFsNode[],
  option: SortOption
): MockFsNode[] {
  const comparator = makeComparator<MockFsNode>(option);
  return [...nodes]
    .map((node) => {
      if (node.type === "dir" && node.children?.length) {
        return { ...node, children: sortFileTree(node.children, option) };
      }
      return { ...node };
    })
    .sort(comparator);
}

/**
 * 切换排序方向工具：asc <-> desc
 */
export function toggleDirection(
  direction: SortOption["direction"]
): SortOption["direction"] {
  return direction === "asc" ? "desc" : "asc";
}

/**
 * 切换排序字段的便捷构造器：变更字段时重置方向为升序
 */
export function withSortBy(by: SortOption["by"]): SortOption {
  return { by, direction: "asc" };
}
