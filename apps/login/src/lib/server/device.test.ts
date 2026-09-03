import { beforeEach, describe, expect, test, vi } from "vitest";
import { approveDeviceAuthorization, denyDeviceAuthorization, startDeviceAuthorization } from "./device";

/**
 * VENHO FORK — what the device grant now refuses to do.
 *
 * Upstream approved the grant from a GET on `/signedin` against whichever
 * session cookie matched, after a consent screen shown before anyone had signed
 * in. So a link was enough to bind a device to a signed-in victim. These tests
 * pin the two conditions that replaced that: this browser must have started the
 * request, and the session it names must pass the same validity gate the rest
 * of the flow uses.
 */

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({})),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock("../service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://api.example.com" } })),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/device", () => ({
  getPendingDeviceAuthorization: vi.fn(),
  rememberDeviceAuthorization: vi.fn(),
  forgetDeviceAuthorization: vi.fn(),
}));

vi.mock("@/lib/cookies", () => ({
  getAllSessions: vi.fn(async () => []),
  getSessionCookieById: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  isSessionValid: vi.fn(),
}));

vi.mock("@/lib/zitadel", () => ({
  getDeviceAuthorizationRequest: vi.fn(),
  authorizeOrDenyDeviceAuthorization: vi.fn(),
  getSession: vi.fn(),
}));

const REQUEST_ID = "device_encrypted-token";
const USER_CODE = "ABCD-1234";

// The id is EncryptToken(deviceCode) — freshly encrypted on every lookup, so it
// is never the same twice and can never be compared. Approval must resolve the
// request from the cookie's user code instead.
const FRESH_ID = "a-different-encrypted-token";

const session = {
  id: "session-1",
  factors: { user: { id: "user-1", loginName: "user@example.com", organizationId: "org-1" } },
} as any;

const cookie = { id: "session-1", token: "token-1", loginName: "user@example.com" };

async function mocks() {
  return {
    getPendingDeviceAuthorization: vi.mocked((await import("@/lib/device")).getPendingDeviceAuthorization),
    forgetDeviceAuthorization: vi.mocked((await import("@/lib/device")).forgetDeviceAuthorization),
    rememberDeviceAuthorization: vi.mocked((await import("@/lib/device")).rememberDeviceAuthorization),
    getAllSessions: vi.mocked((await import("@/lib/cookies")).getAllSessions),
    getSessionCookieById: vi.mocked((await import("@/lib/cookies")).getSessionCookieById),
    isSessionValid: vi.mocked((await import("@/lib/session")).isSessionValid),
    getDeviceAuthorizationRequest: vi.mocked((await import("@/lib/zitadel")).getDeviceAuthorizationRequest),
    authorizeOrDeny: vi.mocked((await import("@/lib/zitadel")).authorizeOrDenyDeviceAuthorization),
    getSession: vi.mocked((await import("@/lib/zitadel")).getSession),
  };
}

async function happyPath() {
  const m = await mocks();
  m.getPendingDeviceAuthorization.mockResolvedValue({ requestId: REQUEST_ID, userCode: USER_CODE, ts: Date.now() });
  m.getSessionCookieById.mockResolvedValue(cookie as never);
  m.getSession.mockResolvedValue({ session } as never);
  m.isSessionValid.mockResolvedValue(true);
  m.getDeviceAuthorizationRequest.mockResolvedValue({ deviceAuthorizationRequest: { id: FRESH_ID } } as never);
  m.authorizeOrDeny.mockResolvedValue({} as never);
  return m;
}

describe("startDeviceAuthorization", () => {
  beforeEach(() => vi.clearAllMocks());

  test("pairs the code with this browser and sends the user to identify themselves", async () => {
    const m = await mocks();
    m.getDeviceAuthorizationRequest.mockResolvedValue({ deviceAuthorizationRequest: { id: "abc" } } as never);
    m.getAllSessions.mockResolvedValue([] as never);

    const res = await startDeviceAuthorization(USER_CODE);

    expect(m.rememberDeviceAuthorization).toHaveBeenCalledWith({ requestId: "device_abc", userCode: USER_CODE });
    // Not /device/consent: consent comes after authentication now.
    expect(res).toEqual({ redirect: "/loginname?requestId=device_abc" });
  });

  test("offers the account picker when the browser already holds sessions", async () => {
    const m = await mocks();
    m.getDeviceAuthorizationRequest.mockResolvedValue({ deviceAuthorizationRequest: { id: "abc" } } as never);
    m.getAllSessions.mockResolvedValue([cookie] as never);

    expect(await startDeviceAuthorization(USER_CODE)).toEqual({ redirect: "/accounts?requestId=device_abc" });
  });

  test("a bad code fails here, before any sign-in is asked for", async () => {
    const m = await mocks();
    m.getDeviceAuthorizationRequest.mockRejectedValue(new Error("not found"));

    expect(await startDeviceAuthorization("NOPE-0000")).toEqual({ error: "noDeviceRequest" });
    expect(m.rememberDeviceAuthorization).not.toHaveBeenCalled();
  });
});

describe("approveDeviceAuthorization", () => {
  beforeEach(() => vi.clearAllMocks());

  test("approves with the session named on the consent screen", async () => {
    const m = await happyPath();

    const res = await approveDeviceAuthorization({ requestId: REQUEST_ID, sessionId: "session-1" });

    // Resolved from the cookie's user code, not from the requestId in the URL.
    expect(m.getDeviceAuthorizationRequest).toHaveBeenCalledWith(expect.objectContaining({ userCode: USER_CODE }));
    expect(m.authorizeOrDeny).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceAuthorizationId: FRESH_ID,
        session: { sessionId: "session-1", sessionToken: "token-1" },
      }),
    );
    expect(m.forgetDeviceAuthorization).toHaveBeenCalledWith(REQUEST_ID);
    expect(res).toEqual({ redirect: `/signedin?requestId=${encodeURIComponent(REQUEST_ID)}&sessionId=session-1` });
  });

  test("refuses a request this browser never started — the link attack", async () => {
    const m = await happyPath();
    m.getPendingDeviceAuthorization.mockResolvedValue(undefined);

    const res = await approveDeviceAuthorization({ requestId: "device_minted-by-someone-else", sessionId: "session-1" });

    expect(res).toEqual({ error: "deviceRequestUnknown" });
    expect(m.authorizeOrDeny).not.toHaveBeenCalled();
  });

  test("refuses a session id the browser holds no cookie for", async () => {
    const m = await happyPath();
    m.getSessionCookieById.mockResolvedValue(undefined);

    const res = await approveDeviceAuthorization({ requestId: REQUEST_ID, sessionId: "someone-elses-session" });

    expect(res).toEqual({ redirect: `/loginname?requestId=${encodeURIComponent(REQUEST_ID)}` });
    expect(m.authorizeOrDeny).not.toHaveBeenCalled();
  });

  test("refuses a session the gate would bounce (MFA outstanding, email unverified)", async () => {
    const m = await happyPath();
    m.isSessionValid.mockResolvedValue(false);

    const res = await approveDeviceAuthorization({ requestId: REQUEST_ID, sessionId: "session-1" });

    expect(res).toEqual({ redirect: `/loginname?requestId=${encodeURIComponent(REQUEST_ID)}` });
    expect(m.authorizeOrDeny).not.toHaveBeenCalled();
  });

  test("says the request is over when the device code expired mid sign-up", async () => {
    const m = await happyPath();
    m.authorizeOrDeny.mockRejectedValue(new Error("Errors.DeviceAuth.AlreadyHandled"));

    expect(await approveDeviceAuthorization({ requestId: REQUEST_ID, sessionId: "session-1" })).toEqual({
      error: "deviceRequestExpired",
    });
  });
});

describe("denyDeviceAuthorization", () => {
  beforeEach(() => vi.clearAllMocks());

  test("cancels the grant with no session attached, and says so", async () => {
    const m = await happyPath();

    const res = await denyDeviceAuthorization({ requestId: REQUEST_ID });

    expect(m.authorizeOrDeny).toHaveBeenCalledWith(expect.objectContaining({ deviceAuthorizationId: FRESH_ID }));
    expect(vi.mocked(m.authorizeOrDeny).mock.calls[0][0]).not.toHaveProperty("session");
    expect(m.forgetDeviceAuthorization).toHaveBeenCalledWith(REQUEST_ID);
    expect(res).toEqual({ redirect: `/signedin?requestId=${encodeURIComponent(REQUEST_ID)}&result=denied` });
  });

  test("refuses to cancel a request this browser never started", async () => {
    const m = await happyPath();
    m.getPendingDeviceAuthorization.mockResolvedValue(undefined);

    expect(await denyDeviceAuthorization({ requestId: "device_someone-elses" })).toEqual({
      error: "deviceRequestUnknown",
    });
    expect(m.authorizeOrDeny).not.toHaveBeenCalled();
  });

  test("still ends on the denied receipt when the request is already gone", async () => {
    const m = await happyPath();
    m.getDeviceAuthorizationRequest.mockRejectedValue(new Error("not found"));

    const res = await denyDeviceAuthorization({ requestId: REQUEST_ID });

    expect(res).toEqual({ redirect: `/signedin?requestId=${encodeURIComponent(REQUEST_ID)}&result=denied` });
  });
});
