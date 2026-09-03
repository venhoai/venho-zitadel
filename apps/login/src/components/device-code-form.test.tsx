import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DeviceCodeForm } from "./device-code-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/server/device", () => ({
  startDeviceAuthorization: vi.fn(),
}));

describe("DeviceCodeForm", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  test("should autofocus the code input on mount", () => {
    const { getByTestId } = render(<DeviceCodeForm />);
    expect(getByTestId("code-text-input")).toHaveFocus();
  });

  test("submitting the code goes to identity, not to consent", async () => {
    // Consent is a decision about which account gets bound to the device, and
    // there is no account yet. The server picks the identity step; the form
    // follows it.
    const { startDeviceAuthorization } = await import("@/lib/server/device");
    vi.mocked(startDeviceAuthorization).mockResolvedValue({ redirect: "/accounts?requestId=device_abc" });

    const { getByTestId } = render(<DeviceCodeForm userCode="ABCD-1234" />);
    // react-hook-form settles `isValid` a tick after mount, and the button is
    // disabled until it does.
    await waitFor(() => expect(getByTestId("submit-button")).not.toBeDisabled());
    fireEvent.click(getByTestId("submit-button"));

    await waitFor(() => expect(startDeviceAuthorization).toHaveBeenCalledWith("ABCD-1234"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/accounts?requestId=device_abc"));
  });

  test("an unknown code is reported here, before any sign-in is asked for", async () => {
    const { startDeviceAuthorization } = await import("@/lib/server/device");
    vi.mocked(startDeviceAuthorization).mockResolvedValue({ error: "noDeviceRequest" });

    const { getByTestId } = render(<DeviceCodeForm userCode="NOPE-0000" />);
    await waitFor(() => expect(getByTestId("submit-button")).not.toBeDisabled());
    fireEvent.click(getByTestId("submit-button"));

    await waitFor(() => expect(getByTestId("error").textContent).toContain("noDeviceRequest"));
    expect(push).not.toHaveBeenCalled();
  });
});
