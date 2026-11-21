import React, { useMemo } from "react";
import AdminSearchSelect from "./AdminSearchSelect.jsx";

export default function CategoryPicker({
  categories = [],
  value = "",
  onChange,
  labelCls,
  inputCls,
  disabled = false,
  emptyMessage = "No catalog categories yet. Add categories under Admin → Categories.",
  placeholder = "Search category…",
}) {
  const options = useMemo(
    () =>
      (categories || []).map((c) => ({
        value: String(c.id),
        label: String(c.name ?? ""),
        searchText: [c.name, c.slug].filter(Boolean).join(" "),
        suffix: c.slug ? `/${c.slug}` : undefined,
      })),
    [categories],
  );

  if (categories.length === 0) {
    return (
      <div>
        <label className={labelCls}>Category</label>
        <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className={labelCls} htmlFor="admin-category-picker">
        Category
      </label>
      <AdminSearchSelect
        inputId="admin-category-picker"
        value={String(value ?? "")}
        onChange={onChange}
        options={options}
        disabled={disabled}
        placeholder={placeholder}
        emptyLabel="— Select category —"
        ariaLabel="Category"
        inputClassName={inputCls}
        menuMinWidth={256}
      />
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Type to search · {options.length} available</p>
    </div>
  );
}
