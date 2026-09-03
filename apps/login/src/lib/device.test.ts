import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  DEVICE_COOKIE_NAME,
  forgetDeviceAuthorization,
  getPendingDeviceAuthorization,
  rememberDeviceAuthorization,
} from "./device";

/**
 * VENHO FORK — this cookie is the only thing that ties a device authorization
 * to the browser that started it. Approval reads the user code from here and
 * never from the URL, so "is this pairing in the cookie?" is the check that
 * stops a requestId someone else minted from being approved by a signed-in
 * victim who merely opened a link.
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: ({ name, value }: { name: string; value: string }) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  })),
}));

vi.mock("./logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const DEVICE_REQUEST_ID = "device_eyJhbGciOiJBMjU2R0NNS1ciLCJlbmMiOiJBMjU2R0NNIn0.abc.def";

describe("the device authorization pairing", () => {
  beforeEach(() => jar.clear());

  test("remembers a request and gives back the user code it was started with", async () => {
    await rememberDeviceAuthorization({ requestId: DEVICE_REQUEST_ID, userCode: "ABCD-1234" });

    const pending = await getPendingDeviceAuthorization(DEVICE_REQUEST_ID);

    expect(pending?.userCode).toBe("ABCD-1234");
  });

  test("does not know a request this browser never started — the whole point", async () => {
    await rememberDeviceAuthorization({ requestId: DEVICE_REQUEST_ID, userCode: "ABCD-1234" });

    expect(await getPendingDeviceAuthorization("device_someone_elses_request")).toBeUndefined();
    expect(await getPendingDeviceAuthorization(undefined)).toBeUndefined();
  });

  test("is httpOnly, path-wide and expires on its own", async () => {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const set = vi.spyOn(store, "set");
    vi.mocked(cookies).mockResolvedValue(store as never);

    await rememberDeviceAuthorization({ requestId: DEVICE_REQUEST_ID, userCode: "ABCD-1234" });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: DEVICE_COOKIE_NAME,
        httpOnly: true,
        path: "/",
        maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
      }),
    );
  });

  test("keeps concurrent requests apart but caps how many it will hold", async () => {
    for (const n of [1, 2, 3, 4]) {
      await rememberDeviceAuthorization({ requestId: `device_${n}`, userCode: `CODE-${n}` });
    }

    // Newest three survive; the stalest pairing is dropped rather than letting
    // the cookie grow — each requestId is a ~264-character JWE.
    expect(await getPendingDeviceAuthorization("device_4")).toBeDefined();
    expect(await getPendingDeviceAuthorization("device_2")).toBeDefined();
    expect(await getPendingDeviceAuthorization("device_1")).toBeUndefined();
  });

  test("re-entering the same code replaces the pairing instead of stacking it", async () => {
    await rememberDeviceAuthorization({ requestId: "device_first", userCode: "ABCD-1234" });
    await rememberDeviceAuthorization({ requestId: "device_second", userCode: "ABCD-1234" });

    expect(await getPendingDeviceAuthorization("device_first")).toBeUndefined();
    expect(await getPendingDeviceAuthorization("device_second")).toBeDefined();
  });

  test("forgets a pairing once the grant is answered, so it cannot be replayed", async () => {
    await rememberDeviceAuthorization({ requestId: DEVICE_REQUEST_ID, userCode: "ABCD-1234" });
    await forgetDeviceAuthorization(DEVICE_REQUEST_ID);

    expect(await getPendingDeviceAuthorization(DEVICE_REQUEST_ID)).toBeUndefined();
    expect(jar.has(DEVICE_COOKIE_NAME)).toBe(false);
  });

  test("ignores an entry older than the cookie's own lifetime", async () => {
    const stale = Date.now() - (DEVICE_COOKIE_MAX_AGE_SECONDS + 60) * 1000;
    jar.set(DEVICE_COOKIE_NAME, JSON.stringify([{ requestId: DEVICE_REQUEST_ID, userCode: "ABCD-1234", ts: stale }]));

    expect(await getPendingDeviceAuthorization(DEVICE_REQUEST_ID)).toBeUndefined();
  });

  test("survives a corrupted cookie rather than breaking the flow", async () => {
    jar.set(DEVICE_COOKIE_NAME, "not json at all");

    expect(await getPendingDeviceAuthorization(DEVICE_REQUEST_ID)).toBeUndefined();

    await rememberDeviceAuthorization({ requestId: DEVICE_REQUEST_ID, userCode: "ABCD-1234" });
    expect(await getPendingDeviceAuthorization(DEVICE_REQUEST_ID)).toBeDefined();
  });
});
