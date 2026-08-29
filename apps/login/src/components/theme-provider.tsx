"use client";
import { ThemeProvider as ThemeP } from "next-themes";
import { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // VENHO FORK: dark by default (upstream: "system"). Every login screen in the
  // Figma set is dark, and the desktop app this signs you into is dark unless the
  // user opts out — landing on a white page mid-flow reads as a different product.
  // An explicit instance branding themeMode still wins (see ThemeWrapper), and so
  // does the user's own toggle, which next-themes persists under `cp-theme`.
  return (
    <ThemeP attribute="class" defaultTheme="dark" storageKey="cp-theme" value={{ dark: "dark" }}>
      {children}
    </ThemeP>
  );
}
