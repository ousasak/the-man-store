import React, { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { detectKhqrBank } from "../../lib/detectKhqrBank.js";

/**
 * Paste or scan a KHQR payload; bank is detected from the Bakong account (@abaa, @aclb, @wing…).
 */
export default function KhqrBankCapture({
  value = "",
  detected,
  onChange,
  disabled = false,
  hint = "ស្កេន QR ធនាគារ — ធនាគារចាប់ស្វ័យប្រវត្តិ",
}) {
  const hostId = `khqr-bank-scan-${useId().replace(/:/g, "")}`;
  const scannerRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState("");

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) {
      setScanning(false);
      return;
    }
    try {
      await scanner.stop();
    } catch {
      /* already stopped */
    }
    try {
      await scanner.clear();
    } catch {
      /* */
    }
    setScanning(false);
  };

  useEffect(() => () => {
    stopScanner();
  }, []);

  const applyPayload = (raw) => {
    const payload = String(raw || "").trim();
    onChange?.(payload, detectKhqrBank(payload));
  };

  const startScanner = async () => {
    setCamError("");
    await stopScanner();
    setScanning(true);
    await new Promise((r) => setTimeout(r, 80));
    const host = document.getElementById(hostId);
    if (!host) {
      setScanning(false);
      return;
    }
    host.innerHTML = "";
    try {
      const scanner = new Html5Qrcode(hostId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          applyPayload(decodedText);
          stopScanner();
        },
        () => {},
      );
    } catch (err) {
      scannerRef.current = null;
      setScanning(false);
      setCamError(err?.message || "Camera failed. Paste the KHQR instead.");
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
        {hint}
      </p>
      <textarea
        rows={3}
        disabled={disabled}
        value={value}
        onChange={(e) => applyPayload(e.target.value)}
        placeholder="Paste KHQR / Bakong account (name@abaa)…"
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-950"
      />
      <div className="flex flex-wrap gap-2">
        {!scanning ? (
          <button
            type="button"
            disabled={disabled}
            onClick={startScanner}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            📷 ស្កេន QR
          </button>
        ) : (
          <button
            type="button"
            onClick={stopScanner}
            className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
          >
            បិទកាមេរ៉ា
          </button>
        )}
      </div>
      {scanning ? (
        <div id={hostId} className="overflow-hidden rounded-xl border border-slate-200 bg-black/80 dark:border-slate-700" />
      ) : (
        <div id={hostId} className="hidden" />
      )}
      {camError ? <p className="text-xs text-red-600">{camError}</p> : null}
      {value.trim() && detected?.id ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          រកឃើញធនាគារ: {detected.label}
          {detected.account ? <span className="ml-2 font-mono text-xs font-normal opacity-80">{detected.account}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
