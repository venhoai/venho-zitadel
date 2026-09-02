import { beforeEach, describe, expect, test, vi } from "vitest";
import { continueWithSession } from "./session";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({})),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock("../service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://api.example.com" } })),
}));

vi.mock("../session", () => ({
  isSessionValid: vi.fn(),
}));

vi.mock("./loginname", () => ({
  sendLoginname: vi.fn(),
}));

vi.mock("../client", () => ({
  completeFlowOrGetUrl: vi.fn(),
}));

vi.mock("../zitadel", () => ({
  getLoginSettings: vi.fn(async () => ({})),
  deleteSession: vi.fn(),
  getSecuritySettings: vi.fn(),
  humanMFAInitSkipped: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("./cookie", () => ({
  createSessionAndUpdateCookie: vi.fn(),
  setSessionAndUpdateCookie: vi.fn(),
}));

vi.mock("../cookies", () => ({
  getMostRecentSessionCookie: vi.fn(),
  getSessionCookieById: vi.fn(),
  getSessionCookieByLoginName: vi.fn(),
  removeSessionFromCookie: vi.fn(),
}));

vi.mock("./host", () => ({
  getPublicHost: vi.fn(),
}));

vi.mock("@zitadel/client", () => ({
  create: vi.fn(),
}));

vi.mock("../grpc/interceptors/error-classification", () => ({
  isClassifiedError: vi.fn(() => false),
}));

const session = {
  id: "session-1",
  factors: { user: { id: "user-1", loginName: "user@example.com", organizationId: "org-1" } },
} as any;

describe("continueWithSession — never dead-ends on the account picker", () => {
  let mockIsSessionValid: ReturnType<typeof vi.fn>;
  let mockSendLoginname: ReturnType<typeof vi.fn>;
  let mockCompleteFlowOrGetUrl: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsSessionValid = vi.mocked((await import("../session")).isSessionValid);
    mockSendLoginname = vi.mocked((await import("./loginname")).sendLoginname);
    mockCompleteFlowOrGetUrl = vi.mocked((await import("../client")).completeFlowOrGetUrl);
  });

  test("invalid session whose re-auth cannot produce a redirect falls back to /loginname (not an error)", async () => {
    mockIsSessionValid.mockResolvedValue(false);
    // sendLoginname declines to redirect (e.g. moreThanOneUserFound / IDP could
    // not start / INITIAL user) — upstream stranded the user here.
    mockSendLoginname.mockResolvedValue(undefined);

    const res = await continueWithSession({ ...session, requestId: "oidc_abc" });

    expect(res).toHaveProperty("redirect");
    const redirect = (res as { redirect: string }).redirect;
    expect(redirect).toContain("/loginname");
    expect(redirect).toContain("loginName=user%40example.com");
    expect(redirect).toContain("organization=org-1");
    expect(redirect).toContain("requestId=oidc_abc");
    expect(res).not.toHaveProperty("error");
  });

  test("invalid session with an error-only re-auth result still falls back to /loginname", async () => {
    mockIsSessionValid.mockResolvedValue(false);
    mockSendLoginname.mockResolvedValue({ error: "moreThanOneUserFound" });

    const res = await continueWithSession({ ...session });

    expect(res).toHaveProperty("redirect");
    expect((res as { redirect: string }).redirect).toContain("/loginname");
  });

  test("invalid session whose re-auth DOES redirect is honoured (password / MFA step)", async () => {
    mockIsSessionValid.mockResolvedValue(false);
    mockSendLoginname.mockResolvedValue({ redirect: "/password?loginName=user%40example.com" });

    const res = await continueWithSession({ ...session });

    expect((res as { redirect: string }).redirect).toBe("/password?loginName=user%40example.com");
  });

  test("valid session completes the flow via completeFlowOrGetUrl", async () => {
    mockIsSessionValid.mockResolvedValue(true);
    mockCompleteFlowOrGetUrl.mockResolvedValue({ redirect: "/signedin?sessionId=session-1" });

    const res = await continueWithSession({ ...session, requestId: "device_abc" });

    expect(mockCompleteFlowOrGetUrl).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1", requestId: "device_abc" }),
      undefined,
    );
    expect((res as { redirect: string }).redirect).toContain("/signedin");
  });

  test("a session with no user factor is a genuine error (no loginName to fall back to)", async () => {
    const res = await continueWithSession({ id: "x", factors: {} } as any);
    expect(res).toHaveProperty("error");
  });
});
