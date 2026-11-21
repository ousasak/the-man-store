import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Unlink, RefreshCw, Copy, Check } from "lucide-react";
import api from "../../lib/api";

/**
 * Generate / revoke one-time Telegram deep-link codes for staff & drivers.
 * @param {boolean} [showSuperAdminHint] — show that Superadmin can revoke anytime
 */
export default function TelegramLinkPanel({ userId, telegram, canManage, onUpdated, showSuperAdminHint = false, role }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codePayload, setCodePayload] = useState(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(telegram || null);

  // Callers pass inline callbacks; keep them out of refresh deps so the fetch effect runs once per user.
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  useEffect(() => {
    setStatus(telegram || null);
  }, [telegram]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await api.get(`/admin/users/${userId}/telegram-link`);
      setStatus(data?.data || null);
      onUpdatedRef.current?.(data?.data || null);
    } catch {
      /* keep local */
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createCode = async () => {
    if (!canManage || !userId) return;
    setBusy(true);
    setError("");
    setCodePayload(null);
    try {
      const { data } = await api.post(`/admin/users/${userId}/telegram-link-code`);
      setCodePayload(data?.data || null);
      await refresh();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create Telegram link code");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!canManage || !userId) return;
    if (!window.confirm("Unlink this Telegram account?")) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.delete(`/admin/users/${userId}/telegram-link`);
      setStatus(data?.data || null);
      setCodePayload(null);
      onUpdatedRef.current?.(data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to unlink Telegram");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    const text = codePayload?.deep_link || codePayload?.bot_command || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (!userId) return null;

  const linked = Boolean(status?.linked);
  const accountRole = String(codePayload?.role || status?.role || role || "").toLowerCase();
  const roleLabel = accountRole || "this account";

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Telegram bot link</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Link personal Telegram to this <span className="font-semibold text-slate-700 dark:text-slate-200">{roleLabel}</span> account.
            Role does not change. Superadmin and admin can press order buttons in the admin group. Customers receive order updates.
            One-time code (~10 min). External couriers do not need an account — unlock the order job QR after pickup confirm.
          </p>
          {showSuperAdminHint ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Superadmin can unlink this Telegram anytime, turn off{" "}
              <span className="font-semibold">Telegram Bot Link → edit</span> to stop an admin from re-linking, or turn
              off <span className="font-semibold">orders → edit</span> to block order buttons even while linked.
            </p>
          ) : null}
        </div>
        <span
          className={
            "shrink-0 inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold " +
            (linked
              ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800"
              : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700")
          }
        >
          {linked ? `Linked · ${roleLabel}` : "Not linked"}
        </span>
      </div>

      {linked ? (
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          @{status?.telegram_username || "no_username"} · ID {status?.telegram_user_id}
        </p>
      ) : null}

      {error ? <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {codePayload ? (
        <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scan / open in Telegram</p>
          {codePayload.deep_link ? (
            <a
              href={codePayload.deep_link}
              target="_blank"
              rel="noreferrer"
              className="block break-all text-sm text-[color:var(--admin-primary)] hover:underline"
            >
              {codePayload.deep_link}
            </a>
          ) : (
            <code className="block text-sm text-slate-800 dark:text-slate-100">{codePayload.bot_command}</code>
          )}
          <p className="text-xs text-slate-500">
            Expires: {codePayload.expires_at ? new Date(codePayload.expires_at).toLocaleString() : "—"}
            {accountRole ? ` · stays ${accountRole}` : ""}
          </p>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={createCode}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[color:var(--admin-primary)] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
          >
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {linked ? "New link code" : "Generate link code"}
          </button>
          {linked ? (
            <button
              type="button"
              disabled={busy}
              onClick={unlink}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              <Unlink className="w-3.5 h-3.5" />
              Unlink
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Linking is turned off for this account (Operations → Telegram Bot Link). Ask a Superadmin to enable it, or
          manage other staff links from their profile as Superadmin.
        </p>
      )}
    </div>
  );
}
