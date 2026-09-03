import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { VerifyForm } from "./verify-form";

// Hoisted so the mock factory (which vitest lifts above the imports) can read a
// value the tests set per case.
const nav = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/verify",
  useSearchParams: () => nav.searchParams,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/server/verify", () => ({
  sendVerification: vi.fn(),
  resendVerification: vi.fn(),
}));

describe("VerifyForm", () => {
  let mockSendVerification: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    nav.searchParams = new URLSearchParams();

    const { sendVerification } = await import("@/lib/server/verify");
    mockSendVerification = vi.mocked(sendVerification);
    mockSendVerification.mockResolvedValue({ redirect: "/success" });
  });

  afterEach(cleanup);

  // VENHO FORK: a send that failed used to look exactly like one that worked —
  // same page, same "enter the code from the verification email" copy, no mail.
  // checkEmailVerification now marks the redirect, and this is where it shows.
  describe("Failed send", () => {
    test("states that the mail could not be sent when the flow says so", () => {
      nav.searchParams = new URLSearchParams("sendFailed=true");

      render(<VerifyForm userId="user-1" code="" isInvite={false} submit={false} />);

      expect(screen.getByTestId("send-failed")).toHaveTextContent("errors.emailSendFailed");
    });

    test("says nothing when the code was sent", () => {
      render(<VerifyForm userId="user-1" code="" isInvite={false} submit={false} />);

      expect(screen.queryByTestId("send-failed")).toBeNull();
    });

    test("a later success outranks the failure marker", () => {
      nav.searchParams = new URLSearchParams("sendFailed=true&codeSent=true");

      render(<VerifyForm userId="user-1" code="" isInvite={false} submit={false} />);

      expect(screen.queryByTestId("send-failed")).toBeNull();
    });
  });

  describe("Input Focus", () => {
    test("should autofocus the code input on mount", () => {
      const { getByTestId } = render(<VerifyForm userId="user-1" code="" isInvite={false} submit={false} />);
      expect(getByTestId("code-text-input")).toHaveFocus();
    });
  });

  describe("Auto-submit Behavior", () => {
    test("should call sendVerification automatically when submit=true", async () => {
      render(<VerifyForm userId="user-1" code="123456" isInvite={false} submit={true} />);

      await waitFor(() => {
        expect(mockSendVerification).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "123456",
            userId: "user-1",
          }),
        );
      });
    });

    test("should prefill code but not auto-submit when submit=false", () => {
      render(<VerifyForm userId="user-1" code="123456" isInvite={false} submit={false} />);

      // The code field is segmented — one box per character — so the whole
      // value lives on the hidden field the form actually submits, and the
      // boxes render it a character at a time.
      expect(screen.getByTestId("code-value")).toHaveValue("123456");
      expect(screen.getByTestId("code-text-input")).toHaveValue("1");

      const submitButton = screen.getByTestId("submit-button");
      expect(submitButton).toBeInTheDocument();

      expect(mockSendVerification).not.toHaveBeenCalled();
    });
  });
});
