"use client";
import { ThemeProvider as ThemeP } from "next-themes";
import { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // VENHO FORK: dark, always (upstream: "system", switchable).
  //
  // Every login screen in the Figma set is dark, and the desktop app this signs
  // you into is dark — landing on a white page mid-flow reads as a different
  // product. So dark is not a default here, it is the only theme: no light
  // screens were designed, and none are reachable.
  //
  // `forcedTheme` is what makes that true rather than merely likely. It short-
  // circuits next-themes' pre-paint script (`if (forcedTheme) apply(forcedTheme)`),
  // so neither the visitor's OS preference nor a stored value is ever consulted.
  // A `defaultTheme` alone is not enough: it loses to both.
  //
  // This deliberately no longer follows the instance's branding themeMode. That
  // is what broke it — the dev instance carries THEME_MODE_AUTO, so every
  // visitor on a light OS got a white login page while the local instance
  // (pinned to THEME_MODE_DARK) looked correct. The app's own look must not
  // hinge on a console field nothing in this repo sets. Branding *colours* are
  // still honoured; see ThemeWrapper.
  //
  // The storage key is Venho's own, not upstream's `cp-theme`: nothing writes to
  // it any more, and a stale `cp-theme` from before this change would otherwise
  // still be read back into `resolvedTheme` — which `forcedTheme` does not
  // override — and hand components like <Avatar> the light palette on a dark page.
  return (
    <ThemeP
      attribute="class"
      forcedTheme="dark"
      defaultTheme="dark"
      themes={["dark"]}
      enableSystem={false}
      storageKey="venho-theme"
      value={{ dark: "dark" }}
    >
      {children}
    </ThemeP>
  );
}
