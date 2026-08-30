"use client";

import { setTheme } from "@/helpers/colors";
import { BrandingSettings, ThemeMode } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import { ReactNode, useEffect, useLayoutEffect } from "react";
import { setThemeMode } from "./branding-context";

type Props = {
  branding: BrandingSettings | undefined;
  children: ReactNode;
};

export const ThemeWrapper = ({ children, branding }: Props) => {
  useEffect(() => {
    setTheme(document, branding);
  }, [branding]);

  // Apply custom font from branding settings before paint to avoid FOUC.
  // When a custom font is uploaded via the label/branding policy, fontUrl
  // contains a fully-resolved URL to the font file served by the assets API.
  // We inject a @font-face rule and set a CSS custom property so the entire
  // login UI picks up the custom font with the existing font as fallback.
  useLayoutEffect(() => {
    const STYLE_ID = "zitadel-custom-font";

    if (branding?.fontUrl) {
      let fontSrc: string;
      try {
        fontSrc = new URL(branding.fontUrl).href;
      } catch {
        // Malformed URL — skip custom font
        return;
      }

      let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = STYLE_ID;
        document.head.appendChild(styleEl);
      }
      // Capture the current font-family (Geist from next/font) before overriding,
      // so it serves as fallback if the custom font fails to load.
      const existingFont = getComputedStyle(document.documentElement).fontFamily || "sans-serif";
      const fontStack = `'ZitadelCustomFont', ${existingFont}`;

      styleEl.textContent = `
        @font-face {
          font-family: 'ZitadelCustomFont';
          font-style: normal;
          font-display: swap;
          src: url('${fontSrc}');
        }
      `;

      document.documentElement.style.setProperty("--zitadel-font-family", fontStack);
      // Inline style overrides the class-based Geist from next/font
      document.documentElement.style.setProperty("font-family", fontStack);
    } else {
      // No custom font — remove injected style and let the Geist class take over
      const existing = document.getElementById(STYLE_ID);
      if (existing) {
        existing.remove();
      }
      document.documentElement.style.removeProperty("--zitadel-font-family");
      document.documentElement.style.removeProperty("font-family");
    }

    return () => {
      const existing = document.getElementById(STYLE_ID);
      if (existing) {
        existing.remove();
      }
      document.documentElement.style.removeProperty("--zitadel-font-family");
      document.documentElement.style.removeProperty("font-family");
    };
  }, [branding?.fontUrl]);

  // Publish themeMode to the module-level store so ThemeSwitch can read it
  useEffect(() => {
    setThemeMode(branding?.themeMode ?? ThemeMode.UNSPECIFIED);
  }, [branding?.themeMode]);

  // VENHO FORK: upstream reads the instance's branding themeMode here and
  // forces light / dark / system from it. We do not: this app is dark-only
  // (ThemeProvider sets `forcedTheme`), and honouring the field is exactly what
  // broke it — the dev instance carries THEME_MODE_AUTO, which upstream maps to
  // "system", so every visitor on a light OS was handed a white login page.
  //
  // Branding *colours* are still applied above, so an instance can restyle the
  // login screens; it just cannot un-dark them. To hand the choice back to the
  // instance, restore this block and drop `forcedTheme` from ThemeProvider —
  // both, or the two disagree and the class flickers.

  return <div>{children}</div>;
};
