import { useCallback, useMemo } from "react";
import {
  ADMIN_LIGHT_MUTED_PALETTE_PRESET_ID,
  ADMIN_SPECTRUM_COLORS,
  ADMIN_SPECTRUM_COLORS_DARK,
  useTheme,
} from "../state/theme.jsx";

export function spectrumHexToRgb(hex) {
  const h = String(hex || "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/i.test(h)) return "110, 139, 126";
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
}

/** Shared Light Muted Palette / primary accent helpers for admin KPIs and charts. */
export function useAdminAccents() {
  const { presetId, primaryColor, mode } = useTheme();
  const isDark = mode === "dark";
  const isSpectrum = presetId === ADMIN_LIGHT_MUTED_PALETTE_PRESET_ID;
  const spectrumList = isDark ? ADMIN_SPECTRUM_COLORS_DARK : ADMIN_SPECTRUM_COLORS;

  const accentAt = useCallback(
    (index = 0) => {
      const n = spectrumList.length;
      return spectrumList[((index % n) + n) % n];
    },
    [spectrumList],
  );

  const iconBoxStyle = useCallback(
    (index = 0) => {
      const hex = accentAt(index);
      return {
        backgroundColor: `rgba(${spectrumHexToRgb(hex)}, ${isDark ? 0.18 : 0.14})`,
        color: hex,
        borderColor: isDark ? `rgba(${spectrumHexToRgb(hex)}, 0.35)` : undefined,
      };
    },
    [isDark, accentAt],
  );

  const barFill = useCallback(
    (index = 0) => (isSpectrum ? accentAt(index) : null),
    [isSpectrum, accentAt],
  );

  const colors = useMemo(() => spectrumList, [spectrumList]);

  return { isSpectrum, primaryColor, presetId, accentAt, iconBoxStyle, barFill, colors };
}
