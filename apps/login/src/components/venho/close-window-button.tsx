"use client";

import { Button, ButtonVariants } from "@/components/button";
import { Translated } from "@/components/translated";
import { useState } from "react";

/**
 * VENHO FORK — the action on a terminal page whose only remaining job is to get
 * out of the user's way.
 *
 * The device grant ends in the browser, but the thing the user was doing is on
 * the device that sent them here. Without an action the page is a dead end they
 * have to work out how to leave; "Continue" gives the moment an ending.
 *
 * It cannot promise to close. `window.close()` is only honoured for a window
 * script opened — the `window.open` path a QR scan or an in-app browser may
 * take — and is silently refused for a tab the OS browser opened on its own,
 * which is what `shell.openExternal` produces. So the button tries, and when
 * the browser refuses it says so plainly rather than appearing broken. There is
 * no third option: nothing in the page can navigate the user back to a native
 * app it was never launched by.
 */
export function CloseWindowButton() {
  const [blocked, setBlocked] = useState(false);

  function close() {
    try {
      window.close();
    } catch {
      // Some browsers throw rather than no-op. Either way the check below is
      // what decides what the user is told.
    }
    // A refused close leaves the page running, so the only honest signal is
    // whether we are still here a moment later.
    setTimeout(() => {
      if (!window.closed) setBlocked(true);
    }, 300);
  }

  return (
    <div className="flex w-full flex-col items-center gap-[12px]">
      <Button
        data-testid="continue-button"
        variant={ButtonVariants.Primary}
        className="h-[40px] w-full justify-center"
        onClick={close}
      >
        <Translated i18nKey="device.continue" namespace="signedin" />
      </Button>

      {blocked && (
        <p className="ztdl-p max-w-[304px] text-center" data-testid="close-blocked">
          <Translated i18nKey="device.closeBlocked" namespace="signedin" />
        </p>
      )}
    </div>
  );
}
