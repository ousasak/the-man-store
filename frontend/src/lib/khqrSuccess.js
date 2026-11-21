const EVENT = "fs-khqr-success";

/**
 * Show the KHQR / Bakong success modal from any page (checkout, payment, admin COD).
 * The host in main.jsx stays mounted, so the alert still pops if the current view unmounts.
 *
 * @param {object} [detail]
 */
export function showKhqrSuccess(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: detail || {} }));
}

/** @param {(detail: object) => void} handler */
export function subscribeKhqrSuccess(handler) {
  if (typeof window === "undefined") return () => {};
  const onShow = (event) => handler(event.detail || {});
  window.addEventListener(EVENT, onShow);
  return () => window.removeEventListener(EVENT, onShow);
}
