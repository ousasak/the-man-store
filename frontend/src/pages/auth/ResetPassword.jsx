import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getApiErrorDetails, submitPasswordReset } from "@/lib/auth-api";
import { useLanguage } from "@/lib/i18n.jsx";

export default function ResetPassword() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const passwordErrors = validationErrors?.password || [];
  const confirmErrors = validationErrors?.password_confirmation || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setValidationErrors({});

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const data = await submitPasswordReset({
        token,
        email,
        password,
        password_confirmation: confirm,
      });

      setSuccess(data?.message || "Password has been reset successfully.");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      const { message, errors } = getApiErrorDetails(err, "Failed to reset password.");
      setError(message);
      setValidationErrors(errors);
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{t("auth.invalidResetLink") || "Invalid reset link"}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("auth.invalidResetLinkDesc") || "The reset link is missing required parameters."}</p>
          <Link to="/forgot-password" className="mt-4 inline-flex text-sm font-medium text-slate-900 underline hover:text-slate-700">
            {t("auth.requestNewResetLink") || "Request a new reset link"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">{t("auth.resetPasswordTitle") || "Reset password"}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("auth.resetPasswordSubtitle") || `Set a new password for ${email}.`}</p>
        {success ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth.newPassword") || "New password"}</label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                required
              />
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
                <li>{t("auth.reqLength") || "At least 8 characters"}</li>
                <li>{t("auth.reqUpper") || "At least one uppercase letter"}</li>
                <li>{t("auth.reqLower") || "At least one lowercase letter"}</li>
                <li>{t("auth.reqNumber") || "At least one number"}</li>
                <li>{t("auth.reqSymbol") || "At least one symbol (example: !@#$%)"}</li>
              </ul>
              {passwordErrors.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-600">
                  {passwordErrors.map((message, index) => (
                    <li key={`password-error-${index}`}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth.confirmPassword") || "Confirm password"}</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                required
              />
              {confirmErrors.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-600">
                  {confirmErrors.map((message, index) => (
                    <li key={`confirm-error-${index}`}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
            >
              {loading ? (t("auth.resetting") || "Resetting...") : (t("auth.resetPassword") || "Reset Password")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
