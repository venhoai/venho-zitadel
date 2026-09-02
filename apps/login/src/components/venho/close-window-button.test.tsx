import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CloseWindowButton } from "./close-window-button";

/**
 * jsdom defines `window.closed` as a plain data property, so vi.spyOn's
 * accessor form cannot take it. Redefine it, and put it back afterwards.
 */
function stubClosed(value: boolean) {
  const original = Object.getOwnPropertyDescriptor(window, "closed");
  Object.defineProperty(window, "closed", { configurable: true, get: () => value });
  return () => {
    if (original) Object.defineProperty(window, "closed", original);
  };
}

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.has = () => false;
    return t;
  },
}));

describe("CloseWindowButton", () => {
  let restoreClosed: (() => void) | undefined;

  afterEach(() => {
    cleanup();
    restoreClosed?.();
    restoreClosed = undefined;
    vi.restoreAllMocks();
  });

  test("labels itself with upstream's translated Continue, not a new string", () => {
    // locales/venho/ claims only the blocked hint. Claiming "Continue" would
    // have cost the translation ZITADEL already ships in every locale.
    const { getByTestId } = render(<CloseWindowButton />);
    expect(getByTestId("continue-button").textContent).toContain("continue");
  });

  test("asks the browser to close, and says nothing while it might still work", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    // A close that succeeds takes the page with it; the honest signal for the
    // opposite case is `window.closed`, so pin it true here.
    restoreClosed = stubClosed(true);

    const { getByTestId, queryByTestId } = render(<CloseWindowButton />);
    getByTestId("continue-button").click();

    expect(close).toHaveBeenCalled();
    // Past the 300ms check, and still silent — nothing was refused.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(queryByTestId("close-blocked")).toBeNull();
  });

  test("admits it when the browser refuses, rather than looking broken", async () => {
    // What `shell.openExternal` produces: a tab no script opened, which
    // silently declines window.close().
    vi.spyOn(window, "close").mockImplementation(() => {});
    restoreClosed = stubClosed(false);

    const { getByTestId } = render(<CloseWindowButton />);
    getByTestId("continue-button").click();

    await waitFor(() => expect(getByTestId("close-blocked")).toBeTruthy());
    expect(getByTestId("close-blocked").textContent).toContain("closeBlocked");
  });

  test("survives a browser that throws instead of declining", async () => {
    vi.spyOn(window, "close").mockImplementation(() => {
      throw new Error("blocked");
    });
    restoreClosed = stubClosed(false);

    const { getByTestId } = render(<CloseWindowButton />);
    // A throw must not escape the handler — the user still gets told.
    expect(() => getByTestId("continue-button").click()).not.toThrow();
    await waitFor(() => expect(getByTestId("close-blocked")).toBeTruthy());
  });
});
