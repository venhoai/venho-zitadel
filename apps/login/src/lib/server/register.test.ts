import { beforeEach, describe, expect, test, vi } from "vitest";
import { registerUser, registerUserAndLinkToIDP } from "./register";

/**
 * VENHO FORK — every sign-up path must verify the email address.
 *
 * This regressed in three independent ways at once, which is why it is pinned
 * here rather than left to the flow:
 *
 *   1. the check itself was gated on EMAIL_VERIFICATION, off in .env and unset
 *      in the deployed container;
 *   2. the passkey path never called it — it minted a `verificationCheck`
 *      cookie and jumped straight to /passkey/set;
 *   3. the IDP path had it commented out upstream.
 *
 * A passkey or a TOTP factor is an additional factor. It is not a substitute for
 * proving you own the address, so none of these paths may complete a sign-up
 * without a trip through /verify.
 */

vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Headers()),
  cookies: vi.fn(),
}));

vi.mock("../service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.example.com" } })),
}));

vi.mock("../zitadel", () => ({
  addHumanUser: vi.fn(),
  addIDPLink: vi.fn(),
  getLoginSettings: vi.fn(),
  getUserByID: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
}));

vi.mock("./cookie", () => ({
  createSessionAndUpdateCookie: vi.fn(),
  createSessionForIdpAndUpdateCookie: vi.fn(),
}));

vi.mock("../verify-helper", () => ({
  checkEmailVerification: vi.fn(),
  checkMFAFactors: vi.fn(),
}));

vi.mock("../client", () => ({
  completeFlowOrGetUrl: vi.fn(() => ({ redirect: "/flow-complete" })),
}));

vi.mock("../fingerprint", () => ({
  getOrSetFingerprintId: vi.fn(() => Promise.resolve("agent-1")),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => (key: string) => key),
}));

const VERIFY_REDIRECT = { redirect: "/verify?loginName=new%40example.com" };

const session = {
  id: "session-1",
  factors: {
    user: {
      id: "user-1",
      loginName: "new@example.com",
      organizationId: "org-1",
    },
  },
};

async function mocks() {
  return {
    zitadel: await import("../zitadel"),
    cookie: await import("./cookie"),
    verifyHelper: await import("../verify-helper"),
    client: await import("../client"),
    headers: await import("next/headers"),
  };
}

let setCookie: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  const m = await mocks();

  setCookie = vi.fn();
  vi.mocked(m.headers.cookies).mockResolvedValue({ set: setCookie } as any);

  vi.mocked(m.zitadel.getLoginSettings).mockResolvedValue({
    allowRegister: true,
    allowLocalAuthentication: true,
  } as any);
  vi.mocked(m.zitadel.addHumanUser).mockResolvedValue({ userId: "user-1" } as any);
  vi.mocked(m.zitadel.addIDPLink).mockResolvedValue({ details: {} } as any);
  vi.mocked(m.zitadel.listAuthenticationMethodTypes).mockResolvedValue({ authMethodTypes: [] } as any);
  vi.mocked(m.cookie.createSessionAndUpdateCookie).mockResolvedValue({ session } as any);
  vi.mocked(m.cookie.createSessionForIdpAndUpdateCookie).mockResolvedValue(session as any);
  vi.mocked(m.verifyHelper.checkMFAFactors).mockResolvedValue(undefined as any);

  // A freshly registered user is always unverified: addHumanUser creates every
  // user with isVerified false, on every path.
  vi.mocked(m.zitadel.getUserByID).mockResolvedValue({
    user: { type: { case: "human", value: { email: { email: "new@example.com", isVerified: false } } } },
  } as any);
  vi.mocked(m.verifyHelper.checkEmailVerification).mockResolvedValue(VERIFY_REDIRECT as any);
});

const command = {
  email: "new@example.com",
  firstName: "New",
  lastName: "User",
  organization: "org-1",
};

describe("registerUser — email verification is not optional", () => {
  test("password sign-up goes to /verify, not into the app", async () => {
    const result = await registerUser({ ...command, password: "hunter2!" });

    expect(result).toEqual(VERIFY_REDIRECT);
  });

  // The regression. Picking "Passkey" on the sign-up screen used to skip
  // verification entirely and land on /passkey/set.
  test("passkey sign-up goes to /verify, not /passkey/set", async () => {
    const result = await registerUser(command);

    expect(result).toEqual(VERIFY_REDIRECT);
    expect(result).not.toEqual(expect.objectContaining({ redirect: expect.stringContaining("/passkey/set") }));
  });

  // The cookie is the proof /passkey/set and /authenticator/set read to decide
  // the user was verified recently. Minting it for an unverified user is the
  // bypass itself, not merely a route to one.
  test("passkey sign-up does not mint a verificationCheck cookie for an unverified user", async () => {
    await registerUser(command);

    expect(setCookie).not.toHaveBeenCalled();
  });

  test("the gate is asked about every path, with the session's own user", async () => {
    const m = await mocks();

    await registerUser(command);
    expect(m.verifyHelper.checkEmailVerification).toHaveBeenCalledTimes(1);

    vi.mocked(m.verifyHelper.checkEmailVerification).mockClear();

    await registerUser({ ...command, password: "hunter2!" });
    expect(m.verifyHelper.checkEmailVerification).toHaveBeenCalledTimes(1);
    expect(m.verifyHelper.checkEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1" }),
      expect.objectContaining({ email: expect.objectContaining({ isVerified: false }) }),
      "org-1",
      undefined,
    );
  });

  test("a verified address is let through — the gate is on verification, not on registering", async () => {
    const m = await mocks();
    vi.mocked(m.verifyHelper.checkEmailVerification).mockResolvedValue(undefined as any);

    const passkey = await registerUser(command);
    expect(passkey).toEqual({ redirect: expect.stringContaining("/passkey/set") });

    const password = await registerUser({ ...command, password: "hunter2!" });
    expect(password).toEqual({ redirect: "/flow-complete" });
  });
});

describe("registerUserAndLinkToIDP — email verification is not optional", () => {
  const idpCommand = {
    ...command,
    idpIntent: { idpIntentId: "intent-1", idpIntentToken: "token-1" },
    idpUserId: "google-1",
    idpId: "idp-1",
    idpUserName: "new@example.com",
  };

  // Upstream ships this check commented out, so signing up through a provider
  // produced a user whose address nobody had confirmed — addHumanUser creates
  // IDP users unverified too.
  test("external sign-up goes to /verify", async () => {
    const result = await registerUserAndLinkToIDP(idpCommand);

    expect(result).toEqual(VERIFY_REDIRECT);
  });

  test("MFA is only considered after the address is verified", async () => {
    const m = await mocks();

    await registerUserAndLinkToIDP(idpCommand);

    expect(m.verifyHelper.checkEmailVerification).toHaveBeenCalled();
    expect(m.verifyHelper.checkMFAFactors).not.toHaveBeenCalled();
  });
});
