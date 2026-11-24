import React, { useMemo } from "react";
import AdminSearchSelect from "./AdminSearchSelect.jsx";
import { useLanguage } from "../../lib/i18n.jsx";

export default function CategoryPicker({
  categories = [],
  value = "",
  onChange,
  labelCls,
  inputCls,
  disabled = false,
  emptyMessage,
  placeholder,
}) {
  const { t } = useLanguage();

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

  const resolvedEmptyMessage = emptyMessage || t("categories.picker.emptyMessage", "No catalog categories yet. Add categories under Admin → Categories.");
  const resolvedPlaceholder = placeholder || t("categories.picker.placeholder", "Search category…");

  if (categories.length === 0) {
    return (
      <div>
        <label className={labelCls}>{t("categories.picker.label", "Category")}</label>
        <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {resolvedEmptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className={labelCls} htmlFor="admin-category-picker">
        {t("categories.picker.label", "Category")}
      </label>
      <AdminSearchSelect
        inputId="admin-category-picker"
        value={String(value ?? "")}
        onChange={onChange}
        options={options}
        disabled={disabled}
        placeholder={resolvedPlaceholder}
        emptyLabel={t("categories.picker.emptyLabel", "— Select category —")}
        ariaLabel={t("categories.picker.label", "Category")}
        inputClassName={inputCls}
        menuMinWidth={256}
      />
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {t("categories.picker.helpText", `Type to search · ${options.length} available`, { count: options.length })}
      </p>
    </div>
  );
}
