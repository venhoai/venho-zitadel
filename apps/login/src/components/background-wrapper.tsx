"use client";

import { useThemeConfig } from "@/lib/theme-hooks";
import { assetUrl } from "./venho/asset";
import { ReactNode } from "react";

/**
 * BackgroundWrapper component handles applying background images from theme configuration.
 * This needs to be a client component to access environment variables via the theme hook.
 */
export function BackgroundWrapper({ children, className = "" }: { children: ReactNode; className?: string }) {
  const themeConfig = useThemeConfig();

  const backgroundStyle = themeConfig.backgroundImage
    ? {
        backgroundImage: `url(${themeConfig.backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : {};

  return (
    <div className={className} style={backgroundStyle}>
      {/* VENHO FORK: the two brand glows the designs put behind every screen —
          blurred circles of the Venho teal, bleeding in from the bottom
          corners. Decorative only, so they are hidden from assistive tech and
          sit at `z-0` beneath the content. Not `-z-10`: a negative index would
          put them behind this element's own background colour, which paints
          over them entirely. A configured background image takes the same slot, so the
          glows are skipped when one is set. */}
      {!themeConfig.backgroundImage && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <img src={assetUrl("/venho/glow-left.svg")} alt="" className="absolute bottom-[-320px] left-[-420px] h-[880px] w-[880px] max-w-none" />
          <img src={assetUrl("/venho/glow-right.svg")} alt="" className="absolute right-[-400px] bottom-[-240px] h-[880px] w-[880px] max-w-none mix-blend-lighten" />
        </div>
      )}
      {children}
    </div>
  );
}
