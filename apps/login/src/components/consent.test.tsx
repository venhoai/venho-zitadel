import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ConsentScreen } from "./consent";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.has = () => false;
    return t;
  },
}));

vi.mock("@/lib/server/device", () => ({
  completeDeviceAuthorization: vi.fn(),
}));

describe("ConsentScreen", () => {
  afterEach(cleanup);

  test("Allow is a plain link to the URL the consent page chose", () => {
    // The screen must not decide the route itself: the server component picks
    // /signedin (valid session found) or /loginname (none), and the button
    // follows it verbatim either way.
    const { getByTestId, rerender, queryByTestId } = render(
      <ConsentScreen
        deviceAuthorizationRequestId="123"
        scope={["openid"]}
        appName="Venho"
        nextUrl="/signedin?requestId=device_123&sessionId=s1"
        continueAs="tom@venho.ai"
      />,
    );
    expect(getByTestId("submit-button").closest("a")).toHaveAttribute("href", "/signedin?requestId=device_123&sessionId=s1");
    // ...and it says WHO the grant will be issued to.
    expect(getByTestId("continue-as").textContent).toContain("request.continueAs");

    rerender(
      <ConsentScreen deviceAuthorizationRequestId="123" scope={["openid"]} appName="Venho" nextUrl="/loginname?requestId=device_123" />,
    );
    expect(getByTestId("submit-button").closest("a")).toHaveAttribute("href", "/loginname?requestId=device_123");
    expect(queryByTestId("continue-as")).toBeNull();
  });

  test("Deny completes the request with NO session, session or not", async () => {
    const { completeDeviceAuthorization } = await import("@/lib/server/device");
    vi.mocked(completeDeviceAuthorization).mockResolvedValue({} as never);

    const { getByTestId } = render(
      <ConsentScreen
        deviceAuthorizationRequestId="123"
        scope={["openid"]}
        appName="Venho"
        nextUrl="/signedin?requestId=device_123&sessionId=s1"
        continueAs="tom@venho.ai"
      />,
    );
    getByTestId("deny-button").click();
    expect(completeDeviceAuthorization).toHaveBeenCalledWith("123");
  });
});
