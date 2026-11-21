import api from "./api";

const OIDC_SRC = "https://oauth.telegram.org/js/telegram-login.js?5";

export async function fetchTelegramSettings() {
  const { data } = await api.get("/telegram/settings");
  return data;
}

export function loadTelegramLoginSdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Telegram login is only available in the browser."));
  }
  if (window.Telegram?.Login?.auth && window.__fsTelegramOidc) {
    return Promise.resolve(window.Telegram.Login);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-telegram-oidc-sdk]");
    if (existing) {
      existing.addEventListener("load", () => {
        window.__fsTelegramOidc = true;
        if (window.Telegram?.Login?.auth) resolve(window.Telegram.Login);
        else reject(new Error("Telegram login failed to load."));
      });
      existing.addEventListener("error", () => reject(new Error("Telegram login failed to load.")));
      return;
    }

    const script = document.createElement("script");
    script.src = OIDC_SRC;
    script.async = true;
    script.dataset.telegramOidcSdk = "1";
    script.onload = () => {
      window.__fsTelegramOidc = true;
      if (window.Telegram?.Login?.auth) resolve(window.Telegram.Login);
      else reject(new Error("Telegram login failed to load."));
    };
    script.onerror = () => reject(new Error("Telegram login failed to load. Pause the ad blocker on this site, then try again."));
    document.head.appendChild(script);
  });
}

export function openTelegramLoginPopup(clientId) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Telegram login is only available in the browser."));
  }

  const id = String(clientId || "").trim();
  if (!id) {
    return Promise.reject(new Error("Telegram Client ID is not configured."));
  }

  const origin = window.location.origin;
  const redirectUri = `${origin}${window.location.pathname || "/"}`;
  const params = new URLSearchParams({
    bot_id: id,
    client_id: id,
    origin,
    redirect_uri: redirectUri,
    request_access: "write",
    return_to: window.location.href,
    scope: "openid profile phone telegram:bot_access",
    response_type: "post_message",
  });
  const authUrl = `https://oauth.telegram.org/auth?${params.toString()}`;

  const width = 550;
  const height = 520;
  const left = Math.max(0, (window.screen.width - width) / 2);
  const top = Math.max(0, (window.screen.height - height) / 2);
  const popup = window.open(
    authUrl,
    `telegram_oauth_bot${id}`,
    `width=${width},height=${height},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`
  );

  if (!popup) {
    return Promise.reject(new Error("popup blocked"));
  }

  popup.focus();

  return new Promise((resolve) => {
    let done = false;
    const finish = (payload) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      resolve(payload || { error: "popup_closed" });
    };

    const onMessage = (event) => {
      if (event.origin !== "https://oauth.telegram.org") return;
      if (event.source !== popup) return;
      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || data.event !== "auth_result") return;

      const result = data.result;
      if (typeof result === "string") {
        finish({ id_token: result });
        return;
      }
      finish(result || { error: "popup_closed" });
    };

    window.addEventListener("message", onMessage);

    const pollClosed = () => {
      if (done) return;
      if (popup.closed) {
        finish({ error: "popup_closed" });
        return;
      }
      window.setTimeout(pollClosed, 300);
    };
    pollClosed();
  });
}

export async function fetchTelegramStatus() {
  const { data } = await api.get("/telegram/status");
  return data;
}

export async function fetchTelegramOrderLink(orderNumber) {
  const { data } = await api.get(`/telegram/orders/${encodeURIComponent(orderNumber)}/link`);
  return data;
}
