import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Facebook, Mail, Send, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Logo from "../Logo.jsx";
import { resolveBundledLogoUrl } from "../../lib/siteLogo.js";
import { DialogPopup, DialogTitle, DialogDescription } from "../ui/Dialog";
import { Tabs, TabsList, TabsTrigger, TabsContents, TabsContent } from "../ui/Tabs";
import { useAuth } from "../../state/auth";

/** Shared corner radius — matches --fs-radius-* in styles/index.css */
export const AUTH_SHELL_CLASS =
  "auth-dialog-shell modal-no-scroll w-full min-w-0 max-w-[560px] overflow-hidden border-0 bg-white p-0 text-slate-900 shadow-[0_32px_96px_rgba(15,23,42,0.28)]";

/* Modern Luxury Obsidian & Gold for The Man Store */
export const AUTH_INPUT =
  "auth-dialog-control h-14 w-full min-w-0 border border-slate-200 bg-slate-50/60 pl-11 pr-4 text-base text-slate-900 shadow-none outline-none transition placeholder:text-slate-400 focus:border-[#0F172A] focus:bg-white focus:ring-2 focus:ring-[#0F172A]/15";

export const AUTH_LABEL = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500";

export const AUTH_PRIMARY_BTN =
  "auth-dialog-control flex h-14 w-full items-center justify-center bg-[#0F172A] text-base font-semibold text-white shadow-md shadow-slate-900/25 transition hover:bg-[#1E293B] hover:shadow-lg hover:shadow-slate-900/30 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F172A] disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-y-0 disabled:shadow-none";

export const AUTH_OUTLINE_BTN =
  "auth-dialog-control flex h-14 w-full items-center justify-center gap-2.5 border border-slate-200 bg-white text-base font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] disabled:opacity-60";

export const PHONE_COUNTRY_CODES = [
  { code: "+855", label: "KH +855" },
  { code: "+1", label: "US +1" },
  { code: "+44", label: "UK +44" },
  { code: "+61", label: "AU +61" },
  { code: "+65", label: "SG +65" },
  { code: "+60", label: "MY +60" },
  { code: "+66", label: "TH +66" },
  { code: "+84", label: "VN +84" },
  { code: "+81", label: "JP +81" },
  { code: "+82", label: "KR +82" },
  { code: "+86", label: "CN +86" },
  { code: "+91", label: "IN +91" },
];

export function GoogleIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AuthDialogShell({
  onClose,
  logoUrl,
  title,
  description,
  activeTab,
  onTabChange,
  children,
}) {
  return (
    <DialogPopup
      className={`${AUTH_SHELL_CLASS} pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]`}
      from="top"
      position="center"
      showCloseButton={false}
    >
      <Tabs value={activeTab} onValueChange={onTabChange}>
        {/* Dark branded header — makes logo clearly visible on any logo color */}
        <div
          className="relative flex flex-col items-center px-10 pb-8 pt-12 border-b border-slate-800"
          style={{
            background: "linear-gradient(160deg, #111827 0%, #0B0F17 65%, #030712 100%)",
          }}
        >
          <DialogPrimitive.Close
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-full border border-white/15 bg-white/10 p-1.5 text-white/70 backdrop-blur-sm transition hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          {/* System logo — transparent PNG sits directly on the header */}
          <Link
            to="/"
            className="mx-auto flex w-fit items-center justify-center transition-opacity hover:opacity-85"
            onClick={onClose}
          >
            <Logo
              className="h-[4.5rem] w-auto max-w-[260px] drop-shadow-md"
              src={resolveBundledLogoUrl(logoUrl)}
              alt="The Man Store"
            />
          </Link>

          {title ? (
            <DialogTitle className="mt-4 text-center text-xl font-semibold tracking-tight text-white">
              {title}
            </DialogTitle>
          ) : (
            <DialogTitle className="sr-only">{activeTab === "register" ? "Register" : "Login"}</DialogTitle>
          )}
          {description ? (
            <DialogDescription className="mt-1.5 text-center text-sm text-white/60">
              {description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              {activeTab === "register" ? "Create a new account" : "Sign in to your account"}
            </DialogDescription>
          )}

          {/* Tab switcher anchored to bottom of header */}
          <TabsList className="auth-dialog-tabs mt-8 w-full">
            <TabsTrigger value="login" className="auth-dialog-tab">
              Login
            </TabsTrigger>
            <TabsTrigger value="register" className="auth-dialog-tab">
              Register
            </TabsTrigger>
          </TabsList>
        </div>

        {/* White form body */}
        <div className="px-10 pb-10 pt-7">
          <TabsContents>{children}</TabsContents>
        </div>
      </Tabs>
    </DialogPopup>
  );
}

export function AuthField({ id, label, hint, icon: Icon, children, error }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={AUTH_LABEL}>
        {label}
      </label>
      {hint ? <p className="mb-1.5 text-xs text-slate-500">{hint}</p> : null}
      <div className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
        ) : null}
        {children}
      </div>
      {error ? <AuthError message={error} /> : null}
    </div>
  );
}

export function AuthError({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="auth-dialog-notice mt-2 flex items-start gap-2 border border-red-200/80 bg-red-50 px-3 py-2.5 text-sm text-red-700"
    >
      <span className="mt-px shrink-0 text-base leading-none">⚠</span>
      <span>{message}</span>
    </div>
  );
}

export function AuthNotice({ message }) {
  if (!message) return null;
  return (
    <div className="auth-dialog-notice flex items-start gap-2 border border-emerald-500/30 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
      <span className="mt-px shrink-0 text-base leading-none">✓</span>
      <span>{message}</span>
    </div>
  );
}

export function OtpDeliveryNotice({ message, emailSent }) {
  if (!message) return null;
  if (emailSent === false) {
    return <AuthError message={message} />;
  }

  return <AuthNotice message={message} />;
}

/** User-facing OTP notice (never includes the code itself). */
export function formatOtpNotice({ message, email, fallback, emailSent }) {
  if (emailSent === false) {
    return (
      message ||
      `We could not deliver the email${email ? ` to ${email}` : ""}. Tap Resend to try again.`
    );
  }

  return (
    message ||
    fallback ||
    (email ? `We sent a verification code to ${email}.` : "A verification code was sent to your email.")
  );
}

export function AuthDivider() {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div className="w-full border-t border-slate-200" />
      </div>
      <div className="relative flex justify-center text-xs uppercase tracking-widest">
        <span className="bg-white px-3 text-slate-400">or continue with</span>
      </div>
    </div>
  );
}

export function AuthSocialButtons({ onGoogle, onFacebook }) {
  return (
    <div className="flex flex-col gap-2.5">
      <button type="button" onClick={onGoogle} className={AUTH_OUTLINE_BTN}>
        <GoogleIcon />
        <span>Google</span>
      </button>
      <button type="button" onClick={onFacebook} className={AUTH_OUTLINE_BTN}>
        <Facebook className="h-5 w-5 text-[#1877F2]" aria-hidden />
        <span>Facebook</span>
      </button>
    </div>
  );
}

export function AuthPhoneField({ id, label, countryCode, onCountryCodeChange, value, onChange, required }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={AUTH_LABEL}>
        {label}
      </label>
      <div className="mt-0 flex gap-2">
        <select
          aria-label="Country code"
          value={countryCode}
          onChange={(e) => onCountryCodeChange(e.target.value)}
          className="auth-dialog-control h-14 w-[120px] shrink-0 border border-slate-200 bg-slate-50 px-2 text-base text-slate-800 outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#0F172A]/15"
        >
          {PHONE_COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          id={id}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value}
          onChange={onChange}
          placeholder="12 345 678"
          className={`${AUTH_INPUT} pl-3`}
          required={required}
        />
      </div>
    </div>
  );
}

export function AuthFooterLink({ children }) {
  return <p className="mt-5 text-center text-sm text-slate-500">{children}</p>;
}

export function AuthTextButton({ children, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-semibold text-[#0F172A] underline-offset-2 hover:text-[#C59B27] hover:underline ${className}`}
    >
      {children}
    </button>
  );
}

const AUTH_METHOD_ICON_WRAP = {
  telegram: "bg-[#2AABEE]/10 text-[#229ED9]",
  google: "border border-slate-200 bg-white",
  facebook: "bg-[#1877F2]/10 text-[#1877F2]",
  email: "bg-slate-100 text-slate-800",
};

export function AuthMethodPicker({
  mode = "login",
  value,
  onChange,
  onContinue,
  methods,
}) {
  const isRegister = mode === "register";
  const items = methods || [
    {
      id: "telegram",
      title: "Use Telegram on this device",
      description: isRegister
        ? "Continue in Telegram to create or open your customer account"
        : "Continue in Telegram to open your customer account",
    },
    {
      id: "email",
      title: "Email and password",
      description: isRegister ? "Register with email" : "Use your The Man Store email",
    },
    {
      id: "google",
      title: "Continue with Google",
      description: isRegister ? "Register with your Google account" : "Sign in with Google",
    },
    {
      id: "facebook",
      title: "Continue with Facebook",
      description: isRegister ? "Register with Facebook" : "Sign in with Facebook",
    },
  ];

  const iconFor = (id) => {
    if (id === "telegram") return Send;
    if (id === "google") return GoogleIcon;
    if (id === "facebook") return Facebook;
    return Mail;
  };

  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-900">
          {isRegister ? "Register options" : "Login options"}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {isRegister
            ? "Choose how you’d like to create your The Man Store account."
            : "Choose how you’d like to log in to The Man Store."}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-slate-100" role="radiogroup" aria-label={isRegister ? "Register options" : "Login options"}>
        {items.map((item, index) => {
          const Icon = iconFor(item.id);
          const selected = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(item.id)}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
                index > 0 ? "border-t border-slate-200/80" : ""
              } ${selected ? "bg-white" : "hover:bg-white/70"}`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  AUTH_METHOD_ICON_WRAP[item.id] || AUTH_METHOD_ICON_WRAP.email
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                {item.description ? (
                  <span className="mt-0.5 block text-xs text-slate-500">{item.description}</span>
                ) : null}
              </span>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-[#2AABEE] bg-[#2AABEE]" : "border-slate-300 bg-white"
                }`}
                aria-hidden
              >
                {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <button type="button" onClick={onContinue} className={AUTH_PRIMARY_BTN}>
        Continue
      </button>
    </div>
  );
}

export function TelegramLoginPanel({ onAuth, onLoggedIn, onBack, error }) {
  const { loginWithTelegramWebApp, loginWithTelegramOidc } = useAuth();
  const [botUsername, setBotUsername] = useState("themanstore_bot");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("idle");
  const [localError, setLocalError] = useState("");
  const webAppTriedRef = useRef(false);
  const shopOrigin = typeof window !== "undefined" ? window.location.origin : "https://themanstore.com";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchTelegramSettings, loadTelegramLoginSdk } = await import("../../lib/telegram.js");
        const data = await fetchTelegramSettings();
        if (cancelled) return;
        if (data?.bot_username) setBotUsername(data.bot_username);
        const id = String(data?.client_id || data?.bot_id || "").trim();
        if (id) setClientId(id);
        await loadTelegramLoginSdk().catch(() => {});
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData || webAppTriedRef.current) return undefined;
    webAppTriedRef.current = true;

    let cancelled = false;
    (async () => {
      setStatus("waiting");
      try {
        const result = await loginWithTelegramWebApp(initData);
        if (cancelled) return;
        if (result?.error) {
          setLocalError(result.message || "Telegram login failed");
          setStatus("idle");
          return;
        }
        onLoggedIn?.(result?.user || result);
      } catch (err) {
        if (cancelled) return;
        setLocalError(err?.response?.data?.message || "Telegram login failed");
        setStatus("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loginWithTelegramWebApp, onLoggedIn]);

  const submitWidgetUser = async (tgUser) => {
    if (!tgUser?.id || !tgUser?.hash) {
      setLocalError("Telegram login was cancelled.");
      setStatus("idle");
      return;
    }
    setStatus("waiting");
    setLocalError("");
    try {
      if (onAuth) {
        await onAuth(tgUser);
      } else {
        onLoggedIn?.(tgUser);
      }
    } catch (err) {
      setLocalError(err?.response?.data?.message || "Telegram login failed. Please try again.");
    } finally {
      setStatus("idle");
    }
  };

  const handleContinue = async () => {
    setLocalError("");
    if (!clientId) {
      setLocalError("Telegram login is not ready yet. Try again in a moment.");
      return;
    }
    setStatus("waiting");
    try {
      const { openTelegramLoginPopup } = await import("../../lib/telegram.js");
      const result = await openTelegramLoginPopup(clientId);
      if (result?.id_token) {
        const session = await loginWithTelegramOidc(result.id_token);
        if (session?.error) {
          setLocalError(session.message || "Telegram login failed");
          setStatus("idle");
          return;
        }
        onLoggedIn?.(session?.user || session);
        setStatus("idle");
        return;
      }
      if (result?.id && result?.hash) {
        await submitWidgetUser(result);
        return;
      }
      const reason = String(result?.error || "");
      if (reason === "popup_closed") {
        setLocalError("Telegram login was cancelled.");
      } else if (/domain|redirect|client|origin|invalid/i.test(reason)) {
        setLocalError(
          `Telegram has not allowed this website yet. Open @BotFather mini app → @${botUsername} → Login Widget → add Allowed URL: ${shopOrigin}`
        );
      } else {
        setLocalError(
          `Open @BotFather (mini app) → @${botUsername} → Login Widget → Allowed URLs → add ${shopOrigin}`
        );
      }
      setStatus("idle");
    } catch (err) {
      const raw = String(err?.message || "");
      if (/popup|blocked/i.test(raw)) {
        setLocalError("Allow pop-ups, and pause the ad blocker on this site, then try Continue via Telegram again.");
      } else {
        setLocalError(err?.message || "Could not open Telegram login.");
      }
      setStatus("idle");
    }
  };

  return (
    <div className="mt-4 flex flex-col items-center gap-4">
      <div className="flex items-center justify-center -space-x-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#229ED9] text-white shadow-md">
          <Send className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-slate-900">Log in with Telegram</p>
        <p className="mt-1 text-sm text-slate-500">
          Your name, username, and profile picture will be transmitted to the website.
        </p>
      </div>
      <AuthError message={localError || error} />
      <button
        type="button"
        onClick={handleContinue}
        disabled={status === "waiting"}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#229ED9] text-base font-semibold text-white shadow-md shadow-[#229ED9]/30 transition hover:bg-[#1b8fc7] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Send className="h-4 w-4" aria-hidden />
        {status === "waiting" ? "Waiting for Telegram…" : "Continue via Telegram"}
      </button>
      {status === "waiting" ? (
        <p className="text-center text-xs text-slate-500">
          Telegram will show the account already signed in. You can use a different account or a phone number, then tap Log in.
        </p>
      ) : (
        <p className="text-center text-xs text-slate-500">
          Open @BotFather mini app → @{botUsername} → Login Widget → Allowed URLs → add {shopOrigin}
        </p>
      )}
      <AuthTextButton onClick={onBack}>← Back to options</AuthTextButton>
    </div>
  );
}

export { TabsContent };
