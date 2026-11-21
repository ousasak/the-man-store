import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import KhqrBankCapture from "../components/admin/KhqrBankCapture.jsx";
import { resolveApiBaseUrl } from "../lib/backendOrigin.js";

export default function DriverCodScanPage() {
  const { token } = useParams();
  const apiBase = resolveApiBaseUrl();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState("");
  const [detected, setDetected] = useState(null);
  const [done, setDone] = useState(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${apiBase}/driver/cod-scan/${token}`);
      const next = data?.data || null;
      setSession(next);
      if (next?.paid) {
        setDone({ label: "Already paid", account: null });
      }
    } catch (e) {
      setError(e?.response?.data?.message || "Scan link expired. Open it again from Telegram.");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (raw, bank) => {
    const qr = String(raw || "").trim();
    if (!qr || savingRef.current || done) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const { data } = await axios.post(`${apiBase}/driver/cod-scan/${token}`, { qr_payload: qr });
      const found = data?.data?.bank || bank;
      setDone(found);
      setDetected(found);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not record this QR.");
      savingRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef3f1]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#567D74]/30 border-t-[#567D74]" />
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef3f1] p-6">
        <p className="max-w-md rounded-2xl bg-white p-6 text-center text-sm text-slate-700 shadow">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef3f1] px-4 py-8">
      <div className="mx-auto max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#567D74]">អ្នកដឹកស្កេន QR</p>
        <h1 className="text-lg font-bold text-slate-900">
          {session?.order_number || "COD"}
        </h1>
        <p className="text-sm text-slate-600">
          សរុប ${Number(session?.total || 0).toFixed(2)}
        </p>
        <p className="text-sm text-slate-700">
          {session?.hint || "ស្កេន QR ធនាគារ — ប្រព័ន្ធចាប់ថាមកពីធនាគារណា។"}
        </p>

        {done ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-bold text-emerald-900">✅ បានកត់ត្រា</p>
            <p className="mt-1 text-sm text-emerald-800">
              ធនាគារ: {done.label || "QR"}
              {done.account ? <span className="ml-2 font-mono text-xs">{done.account}</span> : null}
            </p>
            <p className="mt-2 text-xs text-emerald-700">អាចបិទទំព័រនេះ ហើយត្រលប់ទៅ Telegram។</p>
          </div>
        ) : (
          <>
            <KhqrBankCapture
              value={payload}
              detected={detected}
              disabled={saving}
        hint={session?.hint || "ស្កេន QR ហាង — ធនាគារចាប់ស្វ័យប្រវត្តិ"}
              onChange={(nextPayload, bank) => {
                setPayload(nextPayload);
                setDetected(bank);
                const text = String(nextPayload || "");
                if (text.startsWith("000201") || /@[a-z]{3,12}\b/i.test(text)) {
                  submit(nextPayload, bank);
                }
              }}
            />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <button
              type="button"
              disabled={saving || !payload.trim()}
              onClick={() => submit(payload, detected)}
              className="w-full rounded-xl bg-[#567D74] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "កំពុងកត់ត្រា…" : "កត់ត្រា QR"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
