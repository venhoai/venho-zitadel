"use client";

import {
  lowerCaseValidator,
  maxLengthValidator,
  numberValidator,
  symbolValidator,
  upperCaseValidator,
} from "@/helpers/validators";
import { handleServerActionResponse } from "@/lib/client-utils";
import { registerUser } from "@/lib/server/register";
import { useLeavingRouter } from "@/lib/use-leaving-router";
import { LoginSettings, PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { PasswordComplexitySettings } from "@zitadel/proto/zitadel/settings/v2/password_settings_pb";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Button, ButtonVariants } from "./button";
import { Checkbox } from "./checkbox";
import { TextInput } from "./input";
import { PasswordComplexity } from "./password-complexity";
import { Spinner } from "./spinner";
import { Translated } from "./translated";
import { VENHO_EULA_URL, VENHO_PRIVACY_URL } from "./venho/legal";
import { LoginPrompt } from "./venho/login-prompt";

type Inputs = {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type Props = {
  firstname?: string;
  lastname?: string;
  email?: string;
  organization: string;
  requestId?: string;
  loginSettings?: LoginSettings;
  passwordComplexitySettings?: PasswordComplexitySettings;
  /** "Already have an account? Log in" — the picker or the login name screen. */
  loginHref: string;
};

/**
 * VENHO FORK — sign-up on one page (Figma "Venho new Sidebar UI", frames
 * 1629:33978, 1629:34106 and 1629:34111).
 *
 * Upstream split this in two: name and email with a Passkey/Password choice
 * here, then the password on /register/password. The designs ask for
 * everything at once — names, email, password and its confirmation with the
 * live checklist, and one agreement to the EULA and Privacy Policy — and
 * sign up with a password. A passkey account is still one link away for an
 * instance that allows passkeys, and is the only path when it allows nothing
 * else.
 *
 * An address that already has an account is reported at the email field,
 * with a way to log in as it instead.
 */
export function RegisterForm({
  email,
  firstname,
  lastname,
  organization,
  requestId,
  loginSettings,
  passwordComplexitySettings,
  loginHref,
}: Props) {
  const { register, handleSubmit, watch, trigger, formState } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      email: email ?? "",
      firstname: firstname ?? "",
      lastname: lastname ?? "",
      password: "",
      confirmPassword: "",
    },
  });

  const t = useTranslations("register");
  const { router, navigating } = useLeavingRouter();

  const [submitting, setSubmitting] = useState<boolean>(false);
  const loading = submitting || navigating;
  const [error, setError] = useState<string>("");
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  const withPassword = !!loginSettings?.allowLocalAuthentication;
  const passkeyAllowed = loginSettings?.passkeysType === PasskeysType.ALLOWED;

  const watchEmail = watch("email");
  const watchPassword = watch("password");
  const watchConfirmPassword = watch("confirmPassword");

  const policyIsValid =
    !withPassword ||
    (!!passwordComplexitySettings &&
      watchPassword.length >= passwordComplexitySettings.minLength &&
      (!passwordComplexitySettings.requiresLowercase || lowerCaseValidator(watchPassword)) &&
      (!passwordComplexitySettings.requiresUppercase || upperCaseValidator(watchPassword)) &&
      (!passwordComplexitySettings.requiresNumber || numberValidator(watchPassword)) &&
      (!passwordComplexitySettings.requiresSymbol || symbolValidator(watchPassword)) &&
      maxLengthValidator(watchPassword) &&
      watchPassword === watchConfirmPassword);

  async function submit(values: Inputs, password: string | undefined) {
    setError("");
    setExistingEmail(null);
    setSubmitting(true);
    try {
      const response = await registerUser({
        email: values.email,
        firstName: values.firstname,
        lastName: values.lastname,
        organization,
        requestId,
        password,
      });

      if (response && "emailExists" in response && response.emailExists) {
        setExistingEmail(values.email);
        return;
      }

      handleServerActionResponse(response, router, setSamlData, setError);
    } catch {
      setError(t("errors.couldNotRegisterUser"));
    } finally {
      setSubmitting(false);
    }
  }

  /** Passkey instead: the same account, with no password, enrolling a passkey next. */
  async function submitWithPasskey() {
    const valid = await trigger(["firstname", "lastname", "email"]);
    if (!valid || !agreed) {
      return;
    }
    const { firstname, lastname, email } = watch();
    await submit({ firstname, lastname, email, password: "", confirmPassword: "" }, undefined);
  }

  const loginInsteadParams = new URLSearchParams({ loginName: existingEmail ?? "", submit: "true" });
  if (organization) {
    loginInsteadParams.set("organization", organization);
  }
  if (requestId) {
    loginInsteadParams.set("requestId", requestId);
  }

  // The "already exists" message belongs to the address it was about; editing
  // the field clears it.
  const emailError: ReactNode =
    existingEmail && existingEmail === watchEmail ? (
      <>
        {t("emailExists")}{" "}
        <Link
          href={"/loginname?" + loginInsteadParams}
          className="text-venho-light-secondary dark:text-venho-dark-secondary hover:text-text-light-500 hover:dark:text-text-dark-500 transition-colors"
          data-testid="login-instead"
        >
          {t("loginInstead")}
        </Link>
      </>
    ) : (
      (formState.errors.email?.message as string | undefined)
    );

  const legalLink = (href: string, testId: string, underline: boolean) =>
    function LegalLink(chunks: ReactNode) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={testId}
          className={
            underline
              ? "text-venho-light-secondary dark:text-venho-dark-secondary hover:text-text-light-500 hover:dark:text-text-dark-500 underline"
              : "text-venho-light-secondary dark:text-venho-dark-secondary hover:text-text-light-500 hover:dark:text-text-dark-500 font-medium"
          }
        >
          {chunks}
        </a>
      );
    };

  const canSubmit = formState.isValid && policyIsValid && agreed && !loading;

  return (
    <>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <form className="flex w-full flex-col gap-8" noValidate>
        <div className="flex w-full flex-col gap-6">
          <div className="flex w-full flex-col gap-5">
            <div className="grid grid-cols-2 gap-5">
              <TextInput
                type="text"
                autoComplete="given-name"
                autoFocus
                required
                {...register("firstname", { required: t("required.firstname") })}
                label={t("labels.firstname")}
                placeholder={t("placeholders.firstname")}
                error={formState.errors.firstname?.message as string}
                data-testid="firstname-text-input"
              />
              <TextInput
                type="text"
                autoComplete="family-name"
                required
                {...register("lastname", { required: t("required.lastname") })}
                label={t("labels.lastname")}
                placeholder={t("placeholders.lastname")}
                error={formState.errors.lastname?.message as string}
                data-testid="lastname-text-input"
              />
            </div>
            <TextInput
              type="email"
              autoComplete="email"
              required
              {...register("email", { required: t("required.email") })}
              label={t("labels.email")}
              placeholder={t("placeholders.email")}
              error={emailError}
              data-testid="email-text-input"
            />

            {withPassword && (
              <>
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  required
                  {...register("password", { required: t("password.required.password") })}
                  label={t("password.labels.password")}
                  placeholder={t("placeholders.password")}
                  data-testid="password-text-input"
                />
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  required
                  {...register("confirmPassword", { required: t("password.required.confirmPassword") })}
                  label={t("password.labels.confirmPassword")}
                  placeholder={t("placeholders.password")}
                  data-testid="password-confirm-text-input"
                />
                {passwordComplexitySettings && (
                  <PasswordComplexity
                    passwordComplexitySettings={passwordComplexitySettings}
                    password={watchPassword}
                    equals={!!watchPassword && watchPassword === watchConfirmPassword}
                  />
                )}
              </>
            )}
          </div>

          <label className="flex cursor-pointer flex-row items-start gap-2 text-sm leading-none">
            <Checkbox checked={agreed} onChangeVal={setAgreed} data-testid="agreement-checkbox" />
            <span className="text-venho-light-muted dark:text-venho-dark-muted">
              {t.rich("agreement", {
                eula: legalLink(VENHO_EULA_URL, "eula-link", true),
                privacy: legalLink(VENHO_PRIVACY_URL, "privacy-link", true),
              })}
            </span>
          </label>

          {error && <Alert>{error}</Alert>}

          <div className="flex w-full flex-col items-center gap-4">
            <Button
              className="h-[40px] w-full justify-center font-medium"
              type="submit"
              variant={ButtonVariants.Primary}
              disabled={!canSubmit}
              onClick={handleSubmit((values) => submit(values, withPassword ? values.password : undefined))}
              data-testid="submit-button"
            >
              {loading && <Spinner className="mr-2 h-5 w-5" />}
              <Translated i18nKey="submit" namespace="register" />
            </Button>

            {withPassword && passkeyAllowed && (
              <button
                type="button"
                onClick={submitWithPasskey}
                disabled={loading || !agreed}
                className="text-venho-light-secondary dark:text-venho-dark-secondary hover:text-text-light-500 hover:dark:text-text-dark-500 text-sm leading-5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="passkey-instead"
              >
                {t("passkeyInstead")}
              </button>
            )}

            <p className="text-venho-light-muted dark:text-venho-dark-muted text-center text-xs leading-4 font-medium">
              {t.rich("legalNote", {
                eula: legalLink(VENHO_EULA_URL, "legal-note-eula", false),
                privacy: legalLink(VENHO_PRIVACY_URL, "legal-note-privacy", false),
              })}
            </p>
          </div>
        </div>

        <LoginPrompt href={loginHref} />
      </form>
    </>
  );
}
