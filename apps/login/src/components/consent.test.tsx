import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ConsentScreen } from "./consent";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.has = () => false;
    return t;
  },
}));

vi.mock("@/lib/server/device", () => ({
  approveDeviceAuthorization: vi.fn(),
  denyDeviceAuthorization: vi.fn(),
}));

const props = {
  requestId: "device_123",
  sessionId: "session-1",
  scope: ["openid"],
  appName: "Venho",
  continueAs: "tom@venho.ai",
};

describe("ConsentScreen", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  test("Allow approves the grant for the session it names, and says whose it is", async () => {
    // The click IS the decision now. Upstream made Allow a link and let a later
    // page load bind the grant, which meant the button recorded nothing and the
    // binding needed no button.
    const { approveDeviceAuthorization } = await import("@/lib/server/device");
    vi.mocked(approveDeviceAuthorization).mockResolvedValue({ redirect: "/signedin?requestId=device_123" });

    const { getByTestId } = render(<ConsentScreen {...props} organization="org-1" />);

    expect(getByTestId("submit-button").closest("a")).toBeNull();
    expect(getByTestId("continue-as").textContent).toContain("request.continueAs");

    getByTestId("submit-button").click();

    await waitFor(() =>
      expect(approveDeviceAuthorization).toHaveBeenCalledWith({
        requestId: "device_123",
        sessionId: "session-1",
        organization: "org-1",
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/signedin?requestId=device_123"));
  });

  test("Deny cancels the request", async () => {
    const { denyDeviceAuthorization } = await import("@/lib/server/device");
    vi.mocked(denyDeviceAuthorization).mockResolvedValue({ redirect: "/signedin?requestId=device_123&result=denied" });

    const { getByTestId } = render(<ConsentScreen {...props} />);
    getByTestId("deny-button").click();

    await waitFor(() => expect(denyDeviceAuthorization).toHaveBeenCalledWith({ requestId: "device_123" }));
  });

  test("a refused approval is shown, not swallowed", async () => {
    const { approveDeviceAuthorization } = await import("@/lib/server/device");
    vi.mocked(approveDeviceAuthorization).mockResolvedValue({ error: "deviceRequestExpired" });

    const { getByTestId } = render(<ConsentScreen {...props} />);
    getByTestId("submit-button").click();

    await waitFor(() => expect(getByTestId("error").textContent).toContain("deviceRequestExpired"));
    expect(push).not.toHaveBeenCalled();
  });
});
