import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { create } from "@zitadel/client";
import { LoginSettingsSchema, PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { PasswordComplexitySettingsSchema } from "@zitadel/proto/zitadel/settings/v2/password_settings_pb";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { slowNavigation } from "../../test-mocks/slow-navigation";
import { RegisterForm } from "./register-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    // Rich text: render each tag's chunk through its renderer, so the links
    // the copy carries exist in the DOM.
    t.rich = (key: string, tags: Record<string, (chunks: ReactNode) => ReactNode>) => (
      <>
        {key}
        {Object.entries(tags).map(([tag, render]) => (
          <span key={tag}>{render(tag)}</span>
        ))}
      </>
    );
    t.has = () => false;
    return t;
  },
}));

vi.mock("@/lib/server/register", () => ({
  registerUser: vi.fn(),
}));

const complexity = create(PasswordComplexitySettingsSchema, {
  minLength: BigInt(8),
  requiresLowercase: true,
  requiresUppercase: true,
  requiresNumber: true,
  requiresSymbol: true,
});

const passwordAndPasskey = create(LoginSettingsSchema, {
  allowRegister: true,
  allowLocalAuthentication: true,
  passkeysType: PasskeysType.ALLOWED,
});

function renderForm(loginSettings = passwordAndPasskey, wrapper?: (props: { children: ReactNode }) => ReactNode) {
  return render(
    <RegisterForm
      organization="org-1"
      requestId="device_abc"
      loginSettings={loginSettings}
      passwordComplexitySettings={complexity}
      loginHref="/loginname?requestId=device_abc"
    />,
    { wrapper },
  );
}

function fill(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

function fillValid() {
  fill("firstname-text-input", "John");
  fill("lastname-text-input", "Doe");
  fill("email-text-input", "john@example.test");
  fill("password-text-input", "Picker-Test-1!");
  fill("password-confirm-text-input", "Picker-Test-1!");
}

describe("RegisterForm — sign-up on one page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    push.mockReset();
  });
  afterEach(cleanup);

  test("autofocuses the first name", () => {
    renderForm();
    expect(screen.getByTestId("firstname-text-input")).toHaveFocus();
  });

  test("asks for everything at once: names, email, password and its confirmation", () => {
    renderForm();
    for (const id of [
      "firstname-text-input",
      "lastname-text-input",
      "email-text-input",
      "password-text-input",
      "password-confirm-text-input",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId("password-complexity")).toBeInTheDocument();
    // Upstream's Back button is gone; the way out is "Log in".
    expect(screen.queryByTestId("back-button")).toBeNull();
    expect(screen.getByTestId("login-link")).toHaveAttribute("href", "/loginname?requestId=device_abc");
  });

  test("links the EULA and Privacy Policy, in a new tab", () => {
    renderForm();
    expect(screen.getByTestId("eula-link")).toHaveAttribute("href", "https://venho.ai/eula");
    expect(screen.getByTestId("privacy-link")).toHaveAttribute("href", "https://venho.ai/privacy");
    expect(screen.getByTestId("eula-link")).toHaveAttribute("target", "_blank");
  });

  test("Continue waits for a valid form, a password that meets every rule, and the agreement", async () => {
    renderForm();
    const submit = screen.getByTestId("submit-button");

    fillValid();
    await waitFor(() => expect(submit).toBeDisabled()); // not agreed yet

    fireEvent.click(screen.getByTestId("agreement-checkbox"));
    await waitFor(() => expect(submit).toBeEnabled());

    fill("password-confirm-text-input", "Picker-Test-1?");
    await waitFor(() => expect(submit).toBeDisabled());
  });

  test("signs up with the password, inside the flow it was opened for", async () => {
    const { registerUser } = await import("@/lib/server/register");
    vi.mocked(registerUser).mockResolvedValue({ redirect: "/verify?x=1" });
    renderForm();
    fillValid();
    fireEvent.click(screen.getByTestId("agreement-checkbox"));
    await waitFor(() => expect(screen.getByTestId("submit-button")).toBeEnabled());

    fireEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() =>
      expect(registerUser).toHaveBeenCalledWith({
        email: "john@example.test",
        firstName: "John",
        lastName: "Doe",
        organization: "org-1",
        requestId: "device_abc",
        password: "Picker-Test-1!",
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/verify?x=1"));
  });

  test("stays busy until the next page is on screen, so the account cannot be created twice", async () => {
    const { registerUser } = await import("@/lib/server/register");
    vi.mocked(registerUser).mockResolvedValue({ redirect: "/verify?x=1" });
    const nav = slowNavigation();
    push.mockImplementation(nav.go);
    renderForm(passwordAndPasskey, nav.Shell);
    fillValid();
    fireEvent.click(screen.getByTestId("agreement-checkbox"));
    await waitFor(() => expect(screen.getByTestId("submit-button")).toBeEnabled());

    fireEvent.click(screen.getByTestId("submit-button"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/verify?x=1"));

    // The action has answered and the push has gone out, but /verify is still
    // rendering: the button keeps its spinner and takes no second click.
    const submit = screen.getByTestId("submit-button");
    expect(submit).toBeDisabled();
    expect(submit.querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("passkey-instead")).toBeDisabled();
    fireEvent.click(submit);
    expect(registerUser).toHaveBeenCalledTimes(1);

    await act(async () => nav.arrive());
  });

  test("an address that already has an account is said at the field, with a way to log in as it", async () => {
    const { registerUser } = await import("@/lib/server/register");
    vi.mocked(registerUser).mockResolvedValue({ error: "emailExists", emailExists: true });
    renderForm();
    fillValid();
    fireEvent.click(screen.getByTestId("agreement-checkbox"));
    await waitFor(() => expect(screen.getByTestId("submit-button")).toBeEnabled());

    fireEvent.click(screen.getByTestId("submit-button"));

    const loginInstead = await screen.findByTestId("login-instead");
    expect(loginInstead.getAttribute("href")).toBe(
      "/loginname?loginName=john%40example.test&submit=true&organization=org-1&requestId=device_abc",
    );
    expect(screen.getByTestId("email-text-input")).toHaveAttribute("aria-invalid", "true");
    expect(push).not.toHaveBeenCalled();

    // The message is about that address: editing it clears the error.
    fill("email-text-input", "john2@example.test");
    await waitFor(() => expect(screen.queryByTestId("login-instead")).toBeNull());
  });

  test("a passkey account is one link away, and sends no password", async () => {
    const { registerUser } = await import("@/lib/server/register");
    vi.mocked(registerUser).mockResolvedValue({ redirect: "/verify?x=1" });
    renderForm();
    fill("firstname-text-input", "John");
    fill("lastname-text-input", "Doe");
    fill("email-text-input", "john@example.test");
    fireEvent.click(screen.getByTestId("agreement-checkbox"));

    fireEvent.click(screen.getByTestId("passkey-instead"));

    await waitFor(() =>
      expect(registerUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: "john@example.test", password: undefined }),
      ),
    );
  });

  test("an instance that allows only passkeys gets no password fields and no link", () => {
    renderForm(create(LoginSettingsSchema, { allowRegister: true, passkeysType: PasskeysType.ALLOWED }));
    expect(screen.queryByTestId("password-text-input")).toBeNull();
    expect(screen.queryByTestId("passkey-instead")).toBeNull();
  });
});
