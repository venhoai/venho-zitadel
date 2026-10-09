"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

/**
 * VENHO FORK: a router that says when the page is on its way out.
 *
 * Every form here does the same thing: set `loading`, await a server action,
 * hand the response to `handleServerActionResponse`, and clear `loading` in a
 * `finally`. But `router.push` only starts a navigation — the next route still
 * has to render on the server, often a second or two — so the button went
 * back to idle while the old page stayed on screen. It looked like the click
 * had done nothing, and a second click registered twice, sent a second mail,
 * or found its auth request already used.
 *
 * `navigating` covers that gap:
 *  - `push` and `replace` run inside a transition, which React keeps pending
 *    until the new route commits — the old page is gone when it clears;
 *  - `assign` (a full-page load, for external and custom-scheme URLs) and
 *    `hold` (a SAML form post) leave the document, so they stay true — until
 *    the browser restores this page from its back/forward cache, when the
 *    page is live again and has to be usable.
 *
 * Forms show `submitting || navigating` and disable while it is true.
 */
export function useLeavingRouter() {
  const nextRouter = useRouter();
  const [isPending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setLeaving(false);
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const router = useMemo(
    () => ({
      ...nextRouter,
      push: (...args: Parameters<typeof nextRouter.push>) => startTransition(() => nextRouter.push(...args)),
      replace: (...args: Parameters<typeof nextRouter.replace>) => startTransition(() => nextRouter.replace(...args)),
      assign: (url: string) => {
        setLeaving(true);
        window.location.href = url; // lgtm[js/client-side-unvalidated-url-redirection]
      },
      hold: () => setLeaving(true),
    }),
    [nextRouter],
  );

  return { router, navigating: isPending || leaving };
}
