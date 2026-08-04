export type SortDirection = "asc" | "desc";
export type NullPlacement = "first" | "last";

export interface SortDescriptor<T> {
  value: (item: T) => unknown;
  direction: SortDirection;
}

function isEmpty(value: unknown) {
  return value == null || value === "";
}

export function compareListValues(left: unknown, right: unknown, nulls: NullPlacement = "last") {
  const leftEmpty = isEmpty(left);
  const rightEmpty = isEmpty(right);
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0;
    return leftEmpty === (nulls === "first") ? -1 : 1;
  }
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return String(left).localeCompare(String(right), "ko", { numeric: true, sensitivity: "base" });
}

export function stableMultiSort<T>(items: T[], descriptors: SortDescriptor<T>[], nulls: NullPlacement = "last") {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      for (const descriptor of descriptors) {
        const compared = compareListValues(descriptor.value(left.item), descriptor.value(right.item), nulls);
        if (compared !== 0) return descriptor.direction === "asc" ? compared : -compared;
      }
      return left.index - right.index;
    })
    .map(({ item }) => item);
}
