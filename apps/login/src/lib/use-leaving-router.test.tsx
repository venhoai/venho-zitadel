import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense, use, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { handleServerActionResponse } from "./client-utils";
import { useLeavingRouter } from "./use-leaving-router";

/*
 * A stand-in for the app router that behaves like it where it matters: a push
 * is a state update, and the next page suspends until its data arrives. Inside
 * a transition React keeps the old page on screen meanwhile, which is exactly
 * the window the forms used to show as idle.
 */
let goTo: (url: string) => void = () => {};
const pending = new Map<string, { promise: Promise<void>; resolve: () => void }>();
function nextPage(url: string) {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  pending.set(url, { promise, resolve });
}

const fakeRouter = {
  push: (url: string) => goTo(url),
  replace: (url: string) => goTo(url),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => fakeRouter,
}));

function Page({ url }: { url: string }) {
  const next = pending.get(url);
  if (next) {
    use(next.promise);
  }
  return <p data-testid="page">{url}</p>;
}

function Form() {
  const { router, navigating } = useLeavingRouter();
  return (
    <>
      <button data-testid="continue" disabled={navigating} onClick={() => router.push("/next")}>
        Continue
      </button>
      <button data-testid="saml" disabled={navigating} onClick={() => router.hold()}>
        Post
      </button>
    </>
  );
}

function App() {
  const [url, setUrl] = useState("/start");
  goTo = setUrl;
  return (
    <Suspense fallback={<p>fallback</p>}>
      <Page url={url} />
      <Form />
    </Suspense>
  );
}

describe("useLeavingRouter", () => {
  afterEach(() => {
    cleanup();
    pending.clear();
  });

  test("stays navigating until the next page is on screen, not just until the push", async () => {
    nextPage("/next");
    render(<App />);

    await act(async () => fireEvent.click(screen.getByTestId("continue")));

    // The push has happened; the old page is still showing — and so is the
    // busy button, so it cannot be pressed again.
    expect(screen.getByTestId("page")).toHaveTextContent("/start");
    expect(screen.getByTestId("continue")).toBeDisabled();

    await act(async () => pending.get("/next")!.resolve());

    await waitFor(() => expect(screen.getByTestId("page")).toHaveTextContent("/next"));
    expect(screen.getByTestId("continue")).toBeEnabled();
  });

  test("leaving the document stays busy, until the browser brings the page back", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("saml"));
    expect(screen.getByTestId("saml")).toBeDisabled();

    // A normal pageshow (first load) changes nothing…
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    });
    expect(screen.getByTestId("saml")).toBeDisabled();

    // …a restore from the back/forward cache makes the page usable again.
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    expect(screen.getByTestId("saml")).toBeEnabled();
  });
});

describe("handleServerActionResponse with a leaving router", () => {
  test("an external redirect leaves through assign, so the form stays busy", () => {
    const router = { push: vi.fn(), assign: vi.fn(), hold: vi.fn() };
    handleServerActionResponse({ redirect: "venho://callback?code=1" }, router, vi.fn(), vi.fn());
    expect(router.assign).toHaveBeenCalledWith("venho://callback?code=1");
    expect(router.push).not.toHaveBeenCalled();
  });

  test("a route redirect is a push", () => {
    const router = { push: vi.fn(), assign: vi.fn(), hold: vi.fn() };
    handleServerActionResponse({ redirect: "/verify?x=1" }, router, vi.fn(), vi.fn());
    expect(router.push).toHaveBeenCalledWith("/verify?x=1");
    expect(router.assign).not.toHaveBeenCalled();
  });

  test("a SAML post holds the form busy while it submits", () => {
    const router = { push: vi.fn(), assign: vi.fn(), hold: vi.fn() };
    const setSamlData = vi.fn();
    handleServerActionResponse(
      { samlData: { url: "https://sp.example.test/acs", fields: { SAMLResponse: "x" } } },
      router,
      setSamlData,
      vi.fn(),
    );
    expect(router.hold).toHaveBeenCalled();
    expect(setSamlData).toHaveBeenCalled();
  });
});
