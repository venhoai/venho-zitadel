import { render } from "@testing-library/react";
import { BrandingSettings, ThemeMode } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";
import ThemeSwitch from "./theme-switch";
import { ThemeWrapper } from "./theme-wrapper";

/**
 * VENHO FORK — the login app is dark-only, and this is the net under that claim.
 *
 * It regressed once already, silently: the app followed the instance's branding
 * `themeMode`, the local instance was seeded THEME_MODE_DARK and the dev instance
 * carries THEME_MODE_AUTO, so every visitor on a light OS got a white login page
 * while local testing looked perfect. Nothing that only ever ran against
 * localhost could have caught it.
 *
 * Uses the real next-themes, not a mock: what is being asserted *is* next-themes'
 * behaviour under our props. A mock would assert nothing.
 */

// jsdom has no matchMedia; next-themes reads it to resolve "system".
function stubPrefersDark(prefersDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("dark") ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("ThemeProvider (Venho: dark-only)", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("applies dark when the OS prefers light", () => {
    stubPrefersDark(false);
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("applies dark when the OS prefers dark", () => {
    stubPrefersDark(true);
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // A returning visitor from before the fork forced dark: upstream's key can
  // still hold "light" or "system". forcedTheme ignores storage, but the key
  // rename is what keeps `resolvedTheme` — which forcedTheme does NOT override —
  // from handing components the light palette on a dark page.
  it.each(["light", "system"])("ignores a stale upstream cp-theme=%s", (stale) => {
    stubPrefersDark(false);
    localStorage.setItem("cp-theme", stale);
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("ignores a light value written to our own storage key", () => {
    stubPrefersDark(false);
    localStorage.setItem("venho-theme", "light");
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("sets color-scheme so UA chrome (controls, scrollbars) is dark too", () => {
    stubPrefersDark(false);
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});

describe("ThemeSwitch (Venho: dark-only)", () => {
  it("renders nothing — there is no light theme to switch to", () => {
    stubPrefersDark(false);
    const { container } = render(
      <ThemeProvider>
        <ThemeSwitch />
      </ThemeProvider>,
    );
    // next-themes renders its own pre-paint <script> into the tree, so assert
    // on the switch's own output: no buttons, nothing to click.
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector('[aria-label="Switch to light mode"]')).toBeNull();
  });
});

describe("ThemeWrapper (Venho: instance branding cannot un-dark the app)", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    localStorage.clear();
  });

  // This is the regression, exactly. Upstream maps AUTO -> "system" and LIGHT ->
  // "light"; the dev instance carries AUTO, so a light OS produced a white login
  // page. THEME_MODE_LIGHT is the strongest case: an instance that has explicitly
  // asked for light still gets dark, because no light screens were designed.
  it.each([
    ["UNSPECIFIED", ThemeMode.UNSPECIFIED],
    ["AUTO", ThemeMode.AUTO],
    ["LIGHT", ThemeMode.LIGHT],
    ["DARK", ThemeMode.DARK],
  ])("stays dark when the instance branding says %s", (_label, themeMode) => {
    stubPrefersDark(false);
    const branding = { themeMode } as unknown as BrandingSettings;

    render(
      <ThemeProvider>
        <ThemeWrapper branding={branding}>
          <div />
        </ThemeWrapper>
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(localStorage.getItem("cp-theme")).toBeNull();
  });
});
