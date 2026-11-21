import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeKhqrSuccess } from "../../lib/khqrSuccess.js";
import KhqrSuccessModal from "./KhqrSuccessModal.jsx";

export default function KhqrSuccessHost() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState({});
  const closeRef = useRef(null);
  const redirectRef = useRef(null);

  useEffect(() => subscribeKhqrSuccess((detail) => {
    closeRef.current = typeof detail.onClose === "function" ? detail.onClose : null;
    redirectRef.current = detail.redirectTo || null;
    setMeta(detail || {});
    setOpen(true);
  }), []);

  const handleClose = () => {
    setOpen(false);
    const redirectTo = redirectRef.current;
    const onClose = closeRef.current;
    redirectRef.current = null;
    closeRef.current = null;
    onClose?.();
    if (redirectTo) nav(redirectTo);
  };

  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  const redirectSeconds = Number(meta.redirectSeconds) > 0 ? Number(meta.redirectSeconds) : 0;

  useEffect(() => {
    if (!open || redirectSeconds <= 0) return undefined;
    const timer = setTimeout(() => handleCloseRef.current(), redirectSeconds * 1000);
    return () => clearTimeout(timer);
  }, [open, redirectSeconds]);

  return (
    <KhqrSuccessModal
      open={open}
      orderNumber={meta.orderNumber}
      total={meta.total}
      currency={meta.currency || "KHR"}
      redirectSeconds={redirectSeconds}
      showRedirect={meta.showRedirect !== false && redirectSeconds > 0}
      showTelegram={meta.showTelegram !== false}
      body={meta.body}
      buttonLabel={meta.buttonLabel}
      statusLabel={meta.statusLabel}
      onClose={handleClose}
    />
  );
}
