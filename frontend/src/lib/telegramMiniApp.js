import { useEffect, useState } from "react";

const SESSION_KEY = "fs-telegram-miniapp";
const SCRIPT_SRC = "https://telegram.org/js/telegram-web-app.js";

function readSessionFlag() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSessionFlag() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function hasTelegramWebAppPayload() {
  const tg = window.Telegram?.WebApp;
  if (tg && String(tg.initData || "").length > 0) return true;
  const blob = `${window.location.search || ""}${window.location.hash || ""}`;
  return /(?:^|[?#&])tgWebAppData=/.test(blob);
}

export function isTelegramHost() {
  if (typeof window === "undefined") return false;
  if (window.TelegramWebviewProxy) return true;
  if (window.Telegram?.WebApp) return true;
  const blob = `${window.location.search || ""}${window.location.hash || ""}`;
  return /tgWebApp(Data|Version|Platform)/.test(blob);
}

/** True only inside the Telegram Mini App webview, not the public website. */
export function isTelegramMiniApp() {
  if (typeof window === "undefined") return false;
  if (readSessionFlag()) return true;
  if (!hasTelegramWebAppPayload()) return false;
  writeSessionFlag();
  return true;
}

function markDocument(active) {
  if (typeof document === "undefined") return;
  if (active) document.documentElement.dataset.telegramMiniapp = "1";
  else delete document.documentElement.dataset.telegramMiniapp;
  if (active && isTelegramMiniAppDesktop()) {
    document.documentElement.dataset.telegramMiniappDesktop = "1";
  } else {
    delete document.documentElement.dataset.telegramMiniappDesktop;
  }
}

const PHONE_PLATFORMS = new Set(["android", "ios", "android_x"]);
const DESKTOP_PLATFORMS = new Set(["tdesktop", "macos", "linux", "windows"]);

export function telegramWebAppPlatform() {
  if (typeof window === "undefined") return "";
  return String(window.Telegram?.WebApp?.platform || "").toLowerCase();
}

/** Desktop Telegram client (computer), not iOS/Android Mini App. */
export function isTelegramMiniAppDesktop() {
  if (typeof window === "undefined" || !isTelegramMiniApp()) return false;
  const platform = telegramWebAppPlatform();
  if (PHONE_PLATFORMS.has(platform)) return false;
  if (DESKTOP_PLATFORMS.has(platform)) return true;
  if (window.Telegram?.WebApp?.isFullscreen) return true;
  const screenW = Number(window.screen?.width || 0);
  return window.innerWidth >= 768 || screenW >= 1024;
}

function syncTelegramViewportSize() {
  if (typeof document === "undefined") return;
  const tg = window.Telegram?.WebApp;
  const height = Number(tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight || 0);
  if (height > 0) {
    document.documentElement.style.setProperty("--fs-tg-viewport-height", `${height}px`);
  }
  document.documentElement.style.setProperty("--fs-tg-viewport-width", `${window.innerWidth}px`);
}

let lastFullscreenAttempt = 0;
let fullscreenRequestedOnce = false;
let enteredFullscreenOnce = false;
let closingMiniApp = false;
let webAppEventsBound = false;
let fullscreenExitTimer = 0;

export function closeTelegramMiniApp() {
  if (typeof window === "undefined") return;
  const tg = window.Telegram?.WebApp;
  closingMiniApp = true;
  if (fullscreenExitTimer) {
    window.clearTimeout(fullscreenExitTimer);
    fullscreenExitTimer = 0;
  }
  try {
    if (tg?.isFullscreen) tg.exitFullscreen?.();
  } catch {
    /* ignore */
  }
  try {
    tg?.close?.();
  } catch {
    /* ignore */
  }
}

function onTelegramFullscreenChanged() {
  syncTelegramViewportSize();
  markDocument(isTelegramMiniApp());
  const tg = window.Telegram?.WebApp;
  const now = Boolean(tg?.isFullscreen);
  if (fullscreenExitTimer) {
    window.clearTimeout(fullscreenExitTimer);
    fullscreenExitTimer = 0;
  }
  if (now) {
    enteredFullscreenOnce = true;
    return;
  }
  if (!enteredFullscreenOnce || closingMiniApp || !isTelegramMiniAppDesktop()) return;
  fullscreenExitTimer = window.setTimeout(() => {
    fullscreenExitTimer = 0;
    if (!window.Telegram?.WebApp?.isFullscreen) closeTelegramMiniApp();
  }, 300);
}

function bindWebAppEvents() {
  if (webAppEventsBound || typeof window === "undefined") return;
  const tg = window.Telegram?.WebApp;
  if (!tg?.onEvent) return;
  webAppEventsBound = true;
  tg.onEvent("fullscreenChanged", onTelegramFullscreenChanged);
  tg.onEvent("viewportChanged", syncTelegramViewportSize);
}

function fitDesktopMiniAppWindow() {
  const tg = window.Telegram?.WebApp;
  if (!tg || closingMiniApp) return;
  try {
    tg.expand?.();
  } catch {
    /* ignore */
  }
  syncTelegramViewportSize();
  if (!isTelegramMiniAppDesktop()) return;
  if (tg.isFullscreen || fullscreenRequestedOnce) return;
  const now = Date.now();
  if (now - lastFullscreenAttempt < 1500) return;
  lastFullscreenAttempt = now;
  fullscreenRequestedOnce = true;
  try {
    tg.requestFullscreen?.();
  } catch {
    fullscreenRequestedOnce = false;
  }
}

function bootWebApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.ready?.();
  } catch {
    /* ignore */
  }
  bindWebAppEvents();
  fitDesktopMiniAppWindow();
}

function loadWebAppScript() {
  if (typeof document === "undefined") return;
  if (window.Telegram?.WebApp) {
    bootWebApp();
    return;
  }
  if (document.querySelector("script[data-telegram-web-app]")) return;

  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
  script.async = true;
  script.dataset.telegramWebApp = "1";
  script.onload = () => bootWebApp();
  document.head.appendChild(script);
}

export function initTelegramMiniApp() {
  if (typeof window === "undefined") return false;
  if (hasTelegramWebAppPayload() || readSessionFlag() || window.TelegramWebviewProxy) {
    loadWebAppScript();
    bootWebApp();
  }
  const active = isTelegramMiniApp();
  markDocument(active);
  return active;
}

export function useTelegramMiniAppLayout() {
  const [active, setActive] = useState(() => isTelegramMiniApp());
  const [desktop, setDesktop] = useState(() => isTelegramMiniAppDesktop());

  useEffect(() => {
    const sync = () => {
      const next = initTelegramMiniApp();
      setActive((prev) => (prev === next ? prev : next));
      setDesktop(isTelegramMiniAppDesktop());
    };
    sync();
    const id = window.setInterval(sync, 250);
    const stop = window.setTimeout(() => window.clearInterval(id), 4000);
    window.addEventListener("resize", sync);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return { active, desktop: active && desktop };
}

export function useTelegramMiniApp() {
  return useTelegramMiniAppLayout().active;
}

export function useTelegramMiniAppDesktop() {
  return useTelegramMiniAppLayout().desktop;
}

export function rememberCheckoutAfterLogin(path = "/checkout") {
  try {
    window.sessionStorage.setItem("fs-after-login", path);
  } catch {
    /* ignore */
  }
}

export async function continueTelegramMiniAppCheckout({
  user,
  loginWithTelegramWebApp,
  navigate,
  path = "/checkout",
}) {
  rememberCheckoutAfterLogin(path);
  if (user) {
    navigate(path);
    return true;
  }
  const initData = typeof window !== "undefined" ? window.Telegram?.WebApp?.initData : "";
  if (initData && loginWithTelegramWebApp) {
    const result = await loginWithTelegramWebApp(initData);
    if (!result?.error && (result?.token || result?.user)) {
      navigate(path);
      return true;
    }
  }
  navigate("/login", { state: { from: path } });
  return false;
}

export function isTelegramMiniAppHomePath(pathname = "/") {
  return pathname === "/" || pathname === "";
}

export function goTelegramMiniAppBack(navigate, { cartOpen = false, onCloseCart } = {}) {
  if (cartOpen && typeof onCloseCart === "function") {
    onCloseCart();
    return;
  }

  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const idx = Number(window.history.state?.idx ?? 0);
  if (idx > 0) {
    navigate(-1);
    return;
  }
  if (!isTelegramMiniAppHomePath(path)) {
    navigate("/", { replace: true });
    return;
  }
  closeTelegramMiniApp();
}

export function announceTelegramKhqrPaid({ orderNumber } = {}) {
  if (typeof window === "undefined" || !isTelegramMiniApp()) return;
  const tg = window.Telegram?.WebApp;
  const message = orderNumber
    ? `ការបញ្ជាទិញ ${orderNumber} ត្រូវបានបញ្ជាក់។`
    : "ការបង់ប្រាក់ KHQR ជោគជ័យ។ ការបញ្ជាទិញត្រូវបានបញ្ជាក់។";

  try {
    tg?.HapticFeedback?.notificationOccurred?.("success");
  } catch {
    /* ignore */
  }

  try {
    if (typeof tg?.showPopup === "function") {
      tg.showPopup({
        title: "បង់ប្រាក់ជោគជ័យ",
        message,
        buttons: [{ id: "ok", type: "ok" }],
      });
      return;
    }
    tg?.showAlert?.(message);
  } catch {
    try {
      tg?.showAlert?.(message);
    } catch {
      /* ignore */
    }
  }
}
