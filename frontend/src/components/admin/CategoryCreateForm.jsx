import React, { useState } from "react";
import api from "../../lib/api";
import { useTheme } from "../../state/theme.jsx";
import { closeSwal, errorAlert, loadingAlert, toastSuccess } from "../../lib/swal";
import { getAdminValidationMessage } from "../../lib/adminValidation.js";
import AdminSearchSelect from "./AdminSearchSelect.jsx";

const GENDER_OPTIONS = [
  { value: "", label: "All Genders" },
  { value: "MEN", label: "Men" },
  { value: "WOMEN", label: "Women" },
  { value: "BOY", label: "Boy" },
  { value: "GIRL", label: "Girl" },
];

const CATEGORY_TYPE_OPTIONS = [
  { value: "", label: "Select type" },
  { value: "clothes", label: "Clothes" },
  { value: "shoes", label: "Shoes" },
  { value: "belt", label: "Belt" },
  { value: "hat", label: "Hat" },
  { value: "bag", label: "Bag" },
  { value: "accessory", label: "Accessory" },
  { value: "other", label: "Other" },
];

const EMPTY = { name: "", gender: "", type: "", is_active: true };

const fieldClass =
  "w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 transition-all duration-200 placeholder-slate-400";

export default function CategoryCreateForm({ onSuccess, onCancel, showToast = true }) {
  const { primaryColor, mode } = useTheme();
  const accentColor = primaryColor;
  const accentIsWhite = (accentColor || "").toUpperCase() === "#FFFFFF";
  const [form, setForm] = useState(EMPTY);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const create = async (e) => {
    e.preventDefault();
    if (isCreating) return;
    setCreateError("");
    setIsCreating(true);
    loadingAlert({
      khTitle: "កំពុងបង្កើតប្រភេទ",
      enTitle: "Creating category",
      khText: "សូមរង់ចាំបន្តិច",
      enText: "Please wait",
    });
    try {
      const response = await api.post("/admin/categories", {
        name: form.name,
        gender: form.gender || null,
        type: form.type || null,
        is_active: !!form.is_active,
      });
      if (![200, 201].includes(response?.status)) {
        throw new Error("Create failed.");
      }
      const created = response?.data?.data || response?.data;
      closeSwal();
      if (showToast) {
        await toastSuccess({
          khText: "បានបង្កើតប្រភេទដោយជោគជ័យ",
          enText: "Category created!",
        });
      }
      onSuccess?.(created);
    } catch (e2) {
      closeSwal();
      const detail = e2?.response?.status === 422 ? getAdminValidationMessage(e2) : (e2?.message || "Create failed.");
      const slugHint = String(detail).toLowerCase().includes("slug") ? `សូមបំពេញ Slug - ${detail}` : detail;
      setCreateError(slugHint);
      await errorAlert({
        khTitle: "បង្កើតប្រភេទបរាជ័យ",
        enTitle: "Create failed",
        detail: slugHint,
      });
    } finally {
      closeSwal();
      setIsCreating(false);
    }
  };

  return (
    <form onSubmit={create} className="grid md:grid-cols-12 gap-4 items-end">
      <label className="md:col-span-6">
        <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Category Name</span>
        <input
          value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          required
          className={fieldClass}
          placeholder="e.g., Summer Collection"
        />
      </label>

      <label className="md:col-span-3">
        <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Gender (Optional)</span>
        <AdminSearchSelect
          value={form.gender}
          onChange={(v) => setForm((s) => ({ ...s, gender: v }))}
          options={GENDER_OPTIONS}
          inputClassName={fieldClass}
          placeholder="Search gender…"
          ariaLabel="Gender"
        />
      </label>

      <label className="md:col-span-3">
        <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Category Type</span>
        <AdminSearchSelect
          value={form.type}
          onChange={(v) => setForm((s) => ({ ...s, type: v }))}
          options={CATEGORY_TYPE_OPTIONS}
          inputClassName={fieldClass}
          placeholder="Search type…"
          ariaLabel="Category type"
        />
      </label>

      <label className="md:col-span-6 flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Active Status</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setForm((s) => ({ ...s, is_active: !s.is_active }))}
            className="relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-slate-300 dark:focus:ring-slate-600 dark:focus:ring-offset-slate-800"
            style={{ backgroundColor: form.is_active ? accentColor : (mode === "dark" ? "#334155" : "#e2e8f0") }}
          >
            <span
              className="w-6 h-6 bg-white rounded-full transform transition-transform duration-300"
              style={{ transform: form.is_active ? "translateX(24px)" : "translateX(4px)" }}
            />
          </button>
          <span className="text-sm font-medium text-black dark:text-white min-w-[30px] text-right">
            {form.is_active ? "Yes" : "No"}
          </span>
        </div>
      </label>

      <div className="md:col-span-12 flex flex-wrap items-center justify-end gap-3 pt-2">
        {createError ? (
          <div className="mr-auto rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-100">
            {createError}
          </div>
        ) : null}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isCreating}
            className="h-12 px-5 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={isCreating}
          className={`h-12 min-w-44 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed border ${accentIsWhite ? "border-slate-300" : ""}`}
          style={{
            backgroundColor: accentColor,
            color: accentIsWhite ? "#0b0b0f" : "#FFFFFF",
            borderColor: accentIsWhite ? "#cbd5e1" : accentColor,
          }}
        >
          {isCreating ? "Creating..." : "Add Category"}
        </button>
      </div>
    </form>
  );
}
