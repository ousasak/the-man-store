/** Map list rows to AdminSearchSelect `{ value, label }` options. */
export function mapAdminSelectOptions(items, { valueKey = "id", labelKey = "label", labelFn } = {}) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (item && typeof item === "object" && "value" in item && "label" in item) {
      return item;
    }
    const value = String(item?.[valueKey] ?? "");
    const label = labelFn
      ? labelFn(item)
      : String(item?.[labelKey] ?? item?.name ?? value);
    const searchText = item?.searchText != null ? String(item.searchText) : undefined;
    return searchText ? { value, label, searchText } : { value, label };
  });
}

/** Toolbar / filter rows shaped as `{ id, label }`. */
export function mapIdLabelOptions(items, labelPrefix = "") {
  return mapAdminSelectOptions(items, {
    valueKey: "id",
    labelKey: "label",
    labelFn: (item) => `${labelPrefix}${item?.label ?? item?.id ?? ""}`,
  });
}

export const SORT_DIR_OPTIONS = [
  { value: "desc", label: "Desc" },
  { value: "asc", label: "Asc" },
];
