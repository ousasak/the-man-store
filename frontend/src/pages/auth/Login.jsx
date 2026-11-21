import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../state/auth";
import LoginDialog from "../../components/dialogs/LoginDialog";

function nextAfterLogin(location) {
  const from = location.state?.from;
  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
    return from;
  }
  try {
    const stored = sessionStorage.getItem("fs-after-login");
    if (stored && stored.startsWith("/") && !stored.startsWith("//")) {
      sessionStorage.removeItem("fs-after-login");
      return stored;
    }
  } catch {
    /* ignore */
  }
  return "/";
}

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) {
      navigate(nextAfterLogin(location), { replace: true });
    }
  }, [user, navigate, location]);

  const handleSwitchToRegister = () => {
    navigate("/register", { state: location.state });
  };

  return (
    <div className="min-h-[100dvh] min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4 py-6 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
      <LoginDialog
        isOpen={true}
        onClose={() => navigate(nextAfterLogin(location))}
        onSwitchToRegister={handleSwitchToRegister}
      />
    </div>
  );
}
