function stripDataUrl(b64) {
  return String(b64 || "").replace(/^data:image\/\w+;base64,/, "");
}

export function base64ToPngBlob(b64) {
  const cleaned = stripDataUrl(b64);
  if (!cleaned) return null;
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

export function canvasToPngBlob(canvas) {
  if (!canvas || typeof canvas.toBlob !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/**
 * Save KHQR as a PNG so the customer can open ABA / ACLEDA / Wing
 * and scan from Photos (needed on the same phone / Telegram Mini App).
 */
export async function saveKhqrImage({
  qrImageBase64,
  canvas,
  filename = "themanstore-khqr.png",
} = {}) {
  let blob = qrImageBase64 ? base64ToPngBlob(qrImageBase64) : null;
  if (!blob && canvas) blob = await canvasToPngBlob(canvas);
  if (!blob) throw new Error("QR_NOT_READY");

  const file = new File([blob], filename, { type: "image/png" });

  try {
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "KHQR",
        text: "Save this KHQR, then scan it in your bank app.",
      });
      return "shared";
    }
  } catch (err) {
    if (err?.name === "AbortError") return "cancelled";
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
