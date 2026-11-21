import React, { useState, useEffect } from "react";
import api from "../../lib/api";
import { toast } from "react-hot-toast";
import { AdminContentSkeleton } from "@/components/admin/AdminLoading";

export default function PaymentSettings() {
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [settings, setSettings] = useState({
 bakong: {
 receive_account: "",
 merchant_name: "",
 merchant_city: "",
 },
 enabled_methods: {
 bakong_khqr: true,
 cod: true,
 },
 exchange_rate: 4100,
 });

 useEffect(() => {
 fetchSettings();
 }, []);

 const fetchSettings = async () => {
 try {
 const response = await api.get("/admin/superadmin/payment-settings");
 setSettings(response.data);
 } catch (error) {
 toast.error("Failed to load payment settings");
 console.error(error);
 } finally {
 setLoading(false);
 }
 };

 const handleInputChange = (category, field, value) => {
 setSettings((prev) => ({
 ...prev,
 [category]: {
 ...prev[category],
 [field]: value,
 },
 }));
 };

 const handleMethodToggle = (method) => {
 setSettings((prev) => ({
 ...prev,
 enabled_methods: {
 ...prev.enabled_methods,
 [method]: !prev.enabled_methods[method],
 },
 }));
 };

 const handleSave = async () => {
 setSaving(true);
 try {
 await api.put("/admin/superadmin/payment-settings", settings);
 toast.success("Payment settings updated successfully");
 } catch (error) {
 toast.error(error.response?.data?.message || "Failed to save settings");
 console.error(error);
 } finally {
 setSaving(false);
 }
 };

 if (loading) return <AdminContentSkeleton lines={3} imageHeight={200} />;

 return (
<div className="min-h-full admin-soft text-slate-800 dark:text-slate-100">
<div className="w-full min-w-0">
 <div className="bg-white dark:bg-gray-800 rounded-lg">
 <div className="px-4 py-5 sm:p-6">
 <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-6">
 Payment Gateway Settings
 </h3>

 <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
 <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-4">
 Enabled Payment Methods
 </h4>
 <div className="space-y-4">
 <label className="flex items-center">
 <input
 type="checkbox"
 checked={settings.enabled_methods.bakong_khqr}
 onChange={() => handleMethodToggle("bakong_khqr")}
 className="h-4 w-4 text-[color:var(--admin-primary)] focus:ring-[rgba(var(--admin-primary-rgb),0.4)] border-gray-300 rounded"
 />
 <span className="ml-3 text-gray-700 dark:text-gray-300">
 Bakong KHQR — pay now (all provinces)
 </span>
 </label>
 <label className="flex items-center">
 <input
 type="checkbox"
 checked={settings.enabled_methods.cod}
 onChange={() => handleMethodToggle("cod")}
 className="h-4 w-4 text-[color:var(--admin-primary)] focus:ring-[rgba(var(--admin-primary-rgb),0.4)] border-gray-300 rounded"
 />
 <span className="ml-3 text-gray-700 dark:text-gray-300">
 Pay on delivery (Phnom Penh only)
 </span>
 </label>
 </div>
 </div>

 <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
 <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-4">
 USD → KHR exchange rate (COD)
 </h4>
 <input
 type="number"
 min={1}
 value={settings.exchange_rate ?? 4100}
 onChange={(e) => setSettings((prev) => ({ ...prev, exchange_rate: Number(e.target.value) || 4100 }))}
 className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white dark:bg-gray-700"
 />
 <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
 Used when collecting COD in Khmer Riel or showing KHQR amount at delivery.
 </p>
 </div>

 <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
 <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-4">
 Bakong KHQR Configuration (Cambodia)
 </h4>
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Receive Account (Bakong ID) *
 </label>
 <input
 type="text"
 value={settings.bakong.receive_account}
 onChange={(e) =>
 handleInputChange("bakong", "receive_account", e.target.value)
 }
 placeholder="e.g., yourshop@bkrt"
 className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[rgba(var(--admin-primary-rgb),0.4)]"
 />
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Merchant/Store Name
 </label>
 <input
 type="text"
 value={settings.bakong.merchant_name}
 onChange={(e) =>
 handleInputChange("bakong", "merchant_name", e.target.value)
 }
 placeholder="The Man Store Clothes Store"
 className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[rgba(var(--admin-primary-rgb),0.4)]"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 Merchant City
 </label>
 <input
 type="text"
 value={settings.bakong.merchant_city}
 onChange={(e) =>
 handleInputChange("bakong", "merchant_city", e.target.value)
 }
 placeholder="Phnom Penh"
 className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[rgba(var(--admin-primary-rgb),0.4)]"
 />
 </div>
 </div>
 </div>
 </div>

 <div className="flex justify-end gap-3">
 <button
 onClick={fetchSettings}
 disabled={saving}
 className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-[rgba(var(--admin-primary-rgb),0.4)] disabled:opacity-50"
 >
 Reset
 </button>
 <button
 onClick={handleSave}
 disabled={saving}
 className="px-4 py-2 text-sm font-medium text-white bg-[color:var(--admin-primary)] hover:brightness-110 rounded-md focus:outline-none focus:ring-2 focus:ring-[rgba(var(--admin-primary-rgb),0.45)] disabled:opacity-50"
 >
 {saving ? "Saving..." : "Save Settings"}
 </button>
 </div>
 </div>
 </div>

 <div className="mt-8 bg-[rgba(var(--admin-primary-rgb),0.08)] dark:bg-[rgba(var(--admin-primary-rgb),0.12)] border border-[rgba(var(--admin-primary-rgb),0.25)] dark:border-[rgba(var(--admin-primary-rgb),0.35)] rounded-lg p-4">
 <h5 className="font-semibold text-slate-900 dark:text-white mb-2">
 Payment Configuration Guide
 </h5>
 <ul className="text-sm text-slate-700 dark:text-slate-200 space-y-1">
 <li>• <strong>KHQR:</strong> Customer pays immediately via Bakong scan — required for province delivery.</li>
 <li>• <strong>COD:</strong> Driver pays the shop now (shop shows QR, driver scans ABA/ACLEDA, or cash), or waits to collect from the customer (customer pays the driver’s QR, then driver scans the shop QR to remit).</li>
 <li>• <strong>Exchange rate:</strong> Converts USD order total to KHR for COD collection.</li>
 </ul>
 </div>
 </div>
 </div>
 );
}
