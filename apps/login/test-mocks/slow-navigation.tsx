import { ReactNode, Suspense, use, useState } from "react";

/**
 * VENHO FORK: a page change that takes its time, the way the app router's
 * does — the next route renders on the server first. Make a test's mocked
 * `router.push` call `go`, render inside `Shell`, and the push becomes a state
 * update whose next page suspends until `arrive()`. Meanwhile the form is
 * still on screen, which is the moment a busy button used to fall back to idle.
 */
export function slowNavigation() {
  let setUrl: (url: string) => void = () => {};
  let arrive!: () => void;
  const ready = new Promise<void>((resolve) => (arrive = resolve));

  function NextPage({ url }: { url: string | null }) {
    if (url !== null) {
      use(ready);
    }
    return null;
  }

  function Shell({ children }: { children: ReactNode }) {
    const [url, set] = useState<string | null>(null);
    setUrl = set;
    return (
      <Suspense fallback={null}>
        <NextPage url={url} />
        {children}
      </Suspense>
    );
  }

  return { go: (url: string) => setUrl(url), Shell, arrive: () => arrive() };
}
