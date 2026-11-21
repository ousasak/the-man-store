import React, { useMemo } from "react";
import { filterCountries, formatCountryLabel, resolveCountry } from "../../lib/countries";
import AdminSearchSelect from "./AdminSearchSelect.jsx";

export default function CountryOriginPicker({
  value,
  onChange,
  labelCls,
  inputCls,
  disabled = false,
}) {
  const options = useMemo(
    () =>
      filterCountries("").map((c) => ({
        value: c.code,
        label: `${c.flag || "🏳️"} ${c.label}`,
        searchText: `${c.label} ${c.code}`,
      })),
    [],
  );

  const selected = value ? resolveCountry(value) : null;

  return (
    <div>
      <label className={labelCls} htmlFor="admin-country-origin-picker">
        Origin
      </label>
      <AdminSearchSelect
        inputId="admin-country-origin-picker"
        value={value || ""}
        onChange={onChange}
        options={
          selected && !options.some((o) => o.value === selected.code)
            ? [
                {
                  value: selected.code,
                  label: formatCountryLabel(selected.code),
                  searchText: `${selected.label} ${selected.code}`,
                },
                ...options,
              ]
            : options
        }
        disabled={disabled}
        placeholder="Search country…"
        emptyLabel="— Select country —"
        ariaLabel="Country of origin"
        inputClassName={inputCls}
        menuMinWidth={256}
      />
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Type to search countries</p>
    </div>
  );
}
