import React, { useEffect, useState } from "react";
import { Lock, Mail, User } from "lucide-react";
import { useAuth } from "../../state/auth";
import { useHomepageSettings } from "../../state/homepageSettings.jsx";
import { resolveBackendOrigin } from "../../lib/backendOrigin";
import { Dialog } from "../ui/Dialog";
import {
  AuthDialogShell,
  AuthError,
  AuthField,
  AuthFooterLink,
  AuthMethodPicker,
  formatOtpNotice,
  OtpDeliveryNotice,
  AuthPhoneField,
  AuthTextButton,
  AUTH_INPUT,
  AUTH_PRIMARY_BTN,
  TabsContent,
  TelegramLoginPanel,
} from "../auth/AuthDialogShared";

export default function RegisterDialog({ isOpen, onClose, onSwitchToLogin }) {
  const { settings } = useHomepageSettings();
  const [countryCode, setCountryCode] = useState("+855");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    password_confirmation: "",
  });
  const [otpForm, setOtpForm] = useState({ email: "", code: "", purpose: "register", challengeToken: "" });
  const [otpMode, setOtpMode] = useState(false);
  const [otpNotice, setOtpNotice] = useState("");
  const [otpEmailSent, setOtpEmailSent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("choose");
  const [method, setMethod] = useState("telegram");
  const { register, loginWithTelegram, verifyOtp, resendOtp } = useAuth();

  useEffect(() => {
    if (!isOpen) return;
    setStep("choose");
    setMethod("telegram");
    setError("");
    setOtpMode(false);
    setOtpNotice("");
  }, [isOpen]);

  const fullPhone = phoneLocal.trim() ? `${countryCode}${phoneLocal.replace(/\s+/g, "")}` : "";

  const handleSocial = (provider) => {
    const selectedBackendOrigin = resolveBackendOrigin();
    const normalizedBase = `${selectedBackendOrigin}/api`;
    const frontendCallback = `${window.location.origin}/oauth/callback`;
    localStorage.setItem("oauth_provider", provider);
    window.location.href = `${normalizedBase}/auth/${provider}/redirect?frontend_callback=${encodeURIComponent(frontendCallback)}`;
  };

  const handleContinue = () => {
    setError("");
    if (method === "google") {
      handleSocial("google");
      return;
    }
    if (method === "facebook") {
      handleSocial("facebook");
      return;
    }
    if (method === "telegram") {
      setStep("telegram");
      return;
    }
    setStep("email");
  };

  const handleTelegramAuth = async (tgUser) => {
    setLoading(true);
    setError("");
    try {
      const result = await loginWithTelegram(tgUser);
      if (result?.error) {
        setError(result.message || "Telegram registration failed");
        return;
      }
      finishRegister(result?.user);
    } catch (err) {
      setError(err?.response?.data?.message || "Telegram registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const finishRegister = (user) => {
    setForm({ name: "", email: "", password: "", password_confirmation: "" });
    setPhoneLocal("");
    if (user?.role === "admin" || user?.role === "superadmin") {
      setTimeout(() => {
        window.location.href = "/admin";
      }, 300);
      return;
    }
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.password_confirmation) {
      setError("Passwords do not match");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        name: form.name,
        email: form.email,
        phone: fullPhone,
        password: form.password,
        password_confirmation: form.password_confirmation,
      });
      if (result?.otp_required || result?.verification_required) {
        setOtpMode(true);
        setOtpForm({
          email: form.email,
          code: "",
          purpose: result.purpose || "register",
          challengeToken: result.challenge_token || "",
        });
        setOtpNotice(
          formatOtpNotice({
            message: result.message,
            email: form.email,
            emailSent: result.email_sent,
          }),
        );
        setOtpEmailSent(result.email_sent !== false);
        return;
      }
      finishRegister(result?.user);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Registration failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await verifyOtp({
        email: otpForm.email,
        code: otpForm.code,
        purpose: otpForm.purpose,
        challengeToken: otpForm.challengeToken,
      });
      setOtpMode(false);
      setOtpForm({ email: "", code: "", purpose: "register", challengeToken: "" });
      setOtpNotice("");
      finishRegister(data?.user);
    } catch (err) {
      setError(err?.response?.data?.message || "Verification failed. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await resendOtp({
        email: otpForm.email,
        purpose: otpForm.purpose,
        challengeToken: otpForm.challengeToken,
      });
      setOtpNotice(
        formatOtpNotice({
          message: data?.message,
          email: otpForm.email,
          emailSent: data?.email_sent,
          fallback: `A new code was sent to ${otpForm.email}`,
        }),
      );
      setOtpEmailSent(data?.email_sent !== false);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not resend code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <AuthDialogShell
        onClose={onClose}
        logoUrl={settings?.header?.logo_url || settings?.app_logo_url}
        activeTab="register"
        onTabChange={(value) => {
          if (value === "login") {
            onClose();
            onSwitchToLogin();
          }
        }}
      >
        <TabsContent value="register">
          {!otpMode && step === "choose" ? (
            <>
              <AuthMethodPicker
                mode="register"
                value={method}
                onChange={setMethod}
                onContinue={handleContinue}
              />
              <AuthFooterLink>
                Already have an account?{" "}
                <AuthTextButton
                  onClick={() => {
                    onClose();
                    onSwitchToLogin();
                  }}
                >
                  Login
                </AuthTextButton>
              </AuthFooterLink>
            </>
          ) : null}

          {!otpMode && step === "telegram" ? (
            <TelegramLoginPanel
              onAuth={handleTelegramAuth}
              onLoggedIn={finishRegister}
              onBack={() => {
                setError("");
                setStep("choose");
              }}
              error={error}
            />
          ) : null}

          {!otpMode && step === "email" ? (
            <>
              <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-6">
                <AuthField id="register-name" label="Full name" icon={User}>
                  <input
                    id="register-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="John Doe"
                    className={AUTH_INPUT}
                    required
                  />
                </AuthField>

                <AuthField id="register-email" label="Email" icon={Mail}>
                  <input
                    id="register-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    className={AUTH_INPUT}
                    required
                  />
                </AuthField>

                <AuthPhoneField
                  id="register-phone"
                  label="Phone (optional)"
                  countryCode={countryCode}
                  onCountryCodeChange={setCountryCode}
                  value={phoneLocal}
                  onChange={(e) => setPhoneLocal(e.target.value)}
                />

                <AuthField id="register-password" label="Password" icon={Lock}>
                  <input
                    id="register-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="At least 8 characters"
                    className={AUTH_INPUT}
                    required
                    minLength={8}
                  />
                </AuthField>

                <AuthField id="register-password-confirm" label="Confirm password" icon={Lock}>
                  <input
                    id="register-password-confirm"
                    name="password_confirmation"
                    type="password"
                    autoComplete="new-password"
                    value={form.password_confirmation}
                    onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
                    placeholder="Repeat your password"
                    className={AUTH_INPUT}
                    required
                    minLength={8}
                  />
                </AuthField>

                <AuthError message={error} />

                <button type="submit" disabled={loading} className={AUTH_PRIMARY_BTN}>
                  {loading ? "Registering…" : "Register"}
                </button>
              </form>

              <AuthFooterLink>
                <AuthTextButton
                  onClick={() => {
                    setError("");
                    setStep("choose");
                  }}
                >
                  ← Back to options
                </AuthTextButton>
              </AuthFooterLink>
            </>
          ) : null}

          {otpMode ? (
            <form onSubmit={handleVerifyOtp} className="mt-7 flex flex-col gap-6">
              <OtpDeliveryNotice message={otpNotice} emailSent={otpEmailSent} />
              <AuthField id="register-otp-code" label="Verification code" icon={Lock}>
                <input
                  id="register-otp-code"
                  name="otp_code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpForm.code}
                  onChange={(e) => setOtpForm({ ...otpForm, code: e.target.value })}
                  placeholder="6-digit code"
                  className={AUTH_INPUT}
                  required
                />
              </AuthField>
              <AuthError message={error} />
              <button type="submit" disabled={loading} className={AUTH_PRIMARY_BTN}>
                {loading ? "Verifying…" : "Verify email"}
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-60"
              >
                Resend code
              </button>
              <AuthTextButton
                onClick={() => {
                  setOtpMode(false);
                  setError("");
                  setOtpNotice("");
                  setStep("email");
                }}
              >
                ← Back to register
              </AuthTextButton>
            </form>
          ) : null}
        </TabsContent>
      </AuthDialogShell>
    </Dialog>
  );
}
