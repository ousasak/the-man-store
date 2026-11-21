import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/index.css";
import { AuthProvider } from "./state/auth.jsx";
import { CartProvider } from "./state/cart.jsx";
import { WishlistProvider } from "./state/wishlist.jsx";
import { LanguageProvider } from "./lib/i18n.jsx";
import { ThemeProvider } from "./state/theme.jsx";
import KhqrSuccessHost from "./components/alerts/KhqrSuccessHost.jsx";
import { ensureDocumentBrandAssets } from "./lib/siteLogo.js";
import { wakeBackend } from "./lib/wakeBackend.js";
import { initTelegramMiniApp } from "./lib/telegramMiniApp.js";

ensureDocumentBrandAssets();
wakeBackend();
initTelegramMiniApp();
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <KhqrSuccessHost />
                <App />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
