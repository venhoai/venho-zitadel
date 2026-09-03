import { beforeEach, describe, expect, test, vi } from "vitest";
import { getNextUrl } from "./client";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

// Mock host helper
vi.mock("./server/host", () => ({
  getPublicHostWithProtocol: vi.fn(),
}));

describe("getNextUrl", () => {
  const command = { loginName: "test-user" };

  beforeEach(() => {
    vi.clearAllMocks();
    delete (process.env as any).DEFAULT_REDIRECT_URI;
    delete (process.env as any).NEXT_PUBLIC_BASE_PATH;
  });

  test("should use DEFAULT_REDIRECT_URI if set", async () => {
    process.env.DEFAULT_REDIRECT_URI = "https://env-override.com";
    const result = await getNextUrl(command);
    expect(result).toBe("https://env-override.com");
  });

  test("should use host-based redirect if DEFAULT_REDIRECT_URI is set to a path (starting with '/')", async () => {
    const { headers } = await import("next/headers");
    const { getPublicHostWithProtocol } = await import("./server/host");

    process.env.DEFAULT_REDIRECT_URI = "/dashboard";
    vi.mocked(headers).mockResolvedValue({} as any);
    vi.mocked(getPublicHostWithProtocol).mockReturnValue("https://my-host.com");
    process.env.NEXT_PUBLIC_BASE_PATH = "/ui/v2/login";

    const result = await getNextUrl(command);
    expect(result).toBe("https://my-host.com/dashboard");
  });

  test("should use defaultRedirectUri if env is NOT set", async () => {
    const result = await getNextUrl(command, "https://settings.com");
    expect(result).toBe("https://settings.com");
  });

  test("should fallback to relative signedin page if everything else fails (the new default)", async () => {
    const { headers } = await import("next/headers");
    vi.mocked(headers).mockRejectedValue(new Error("No headers"));

    const result = await getNextUrl(command);
    expect(result).toBe("/signedin?loginName=test-user");
  });

  /**
   * VENHO FORK — every authenticated path in the app converges here, which is
   * what makes it the place to insist consent comes last. A device grant used
   * to be sent straight to /signedin, where loading the page approved it.
   */
  describe("a device grant goes to consent, never straight to the receipt", () => {
    test("carries the session it authenticated as", async () => {
      const result = await getNextUrl({
        sessionId: "session-1",
        requestId: "device_abc",
        organization: "org-1",
      });

      expect(result).toBe("/device/consent?requestId=device_abc&sessionId=session-1&organization=org-1");
    });

    test("falls back to the login name when a path finishes without a session id", async () => {
      const result = await getNextUrl({ loginName: "test-user", requestId: "device_abc" } as never);

      expect(result).toBe("/device/consent?requestId=device_abc&loginName=test-user");
    });

    test("leaves OIDC alone — a short requestId still ends where it always did", async () => {
      const { headers } = await import("next/headers");
      vi.mocked(headers).mockRejectedValue(new Error("No headers"));

      const result = await getNextUrl({ loginName: "test-user", requestId: "oidc_V2_123" } as never);

      expect(result).not.toContain("/device/consent");
    });
  });
});
