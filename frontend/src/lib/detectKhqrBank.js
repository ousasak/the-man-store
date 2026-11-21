/** Bakong KHQR / EMV account suffix → settlement bank id. */
const BAKONG_SUFFIX_TO_BANK = {
  abaa: "aba",
  aba: "aba",
  aclb: "acleda",
  acle: "acleda",
  acleda: "acleda",
  wing: "wing",
};

const SUFFIX_LABELS = {
  abaa: "ABA",
  aba: "ABA",
  aclb: "ACLEDA",
  acle: "ACLEDA",
  acleda: "ACLEDA",
  wing: "Wing",
  cadi: "Canadia",
  sath: "Sathapana",
  vblc: "Vattanac",
  ppcb: "Prince",
  hlbk: "Hong Leong",
  amkb: "AMK",
  pchc: "PPCBank",
};

function bankLabel(id, suffix) {
  if (id === "aba") return "ABA";
  if (id === "acleda") return "ACLEDA";
  if (id === "wing") return "Wing";
  if (suffix && SUFFIX_LABELS[suffix]) return SUFFIX_LABELS[suffix];
  return "QR ផ្សេងទៀត";
}

/**
 * Read nested EMV TLV values from a KHQR payload.
 * @param {string} payload
 * @returns {string[]}
 */
function emvValues(payload) {
  const out = [];
  let i = 0;
  const s = String(payload || "");
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2);
    const len = Number.parseInt(s.slice(i + 2, i + 4), 10);
    if (!id || Number.isNaN(len) || len < 0 || i + 4 + len > s.length) break;
    const value = s.slice(i + 4, i + 4 + len);
    out.push(value);
    if (/^\d{2,}/.test(value) && value.length >= 6) {
      out.push(...emvValues(value));
    }
    i += 4 + len;
  }
  return out;
}

/**
 * @param {string} raw
 * @returns {{ id: 'aba'|'acleda'|'wing'|'other', label: string, account: string|null }}
 */
export function detectKhqrBank(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { id: "other", label: "QR ផ្សេងទៀត", account: null };
  }

  const haystack = [text, ...emvValues(text)].join("\n");
  const accountMatch = haystack.match(/([a-z0-9._-]{2,40})@([a-z]{3,12})/i);
  if (accountMatch) {
    const account = accountMatch[0];
    const suffix = accountMatch[2].toLowerCase();
    const id = BAKONG_SUFFIX_TO_BANK[suffix] || "other";
    return { id, label: bankLabel(id, suffix), account };
  }

  const lower = haystack.toLowerCase();
  if (/\baba(\s|$|bank|pay|khqr)/i.test(haystack) || lower.includes("ababank") || lower.includes("pay.aba")) {
    return { id: "aba", label: "ABA", account: null };
  }
  if (lower.includes("acleda")) {
    return { id: "acleda", label: "ACLEDA", account: null };
  }
  if (/\bwing\b/.test(lower) || lower.includes("wingbank")) {
    return { id: "wing", label: "Wing", account: null };
  }

  return { id: "other", label: "QR ផ្សេងទៀត", account: null };
}
