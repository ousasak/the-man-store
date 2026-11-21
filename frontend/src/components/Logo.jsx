import React, { useMemo } from "react";
import { resolveImageUrl } from "../lib/images";
import {
  BUNDLED_SITE_LOGO_SRC,
  BUNDLED_SITE_LOGO_SVG,
  isBundledSiteLogo,
  resolveBundledLogoUrl,
  siteStaticLogoPath,
} from "../lib/siteLogo.js";

export { siteStaticLogoPath, BUNDLED_SITE_LOGO_SRC, BUNDLED_SITE_LOGO_SVG };

const svgClass =
  "[&>svg]:block [&>svg]:h-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:max-w-full";

function BundledLogo({ className, alt }) {
  return (
    <span
      className={`relative inline-flex items-center justify-center ${svgClass} ${className}`}
      role="img"
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: BUNDLED_SITE_LOGO_SVG }}
    />
  );
}

export default function Logo({ className = "h-12 w-auto", src, alt = "The Man Store" }) {
  const useBundled = !src || isBundledSiteLogo(src);

  const customSrc = useMemo(() => {
    if (useBundled) return null;
    return resolveImageUrl(String(src).trim()) || null;
  }, [src, useBundled]);

  if (useBundled || !customSrc) {
    return <BundledLogo className={className} alt={alt} />;
  }

  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <img
        src={customSrc}
        alt={alt}
        decoding="async"
        className="max-h-full w-auto object-contain"
      />
    </span>
  );
}

export { resolveBundledLogoUrl, isBundledSiteLogo };
