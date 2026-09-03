"use client";

import { completeFlowOrGetUrl } from "@/lib/client";
import { handleServerActionResponse } from "@/lib/client-utils";
import { updateOrCreateSession } from "@/lib/server/session";
import { appendRequestIdToUrlTemplate } from "@/lib/url-template";
import { create } from "@zitadel/client";
import { RequestChallengesSchema } from "@zitadel/proto/zitadel/session/v2/challenge_pb";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { LoginSettings } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { AutoSubmitForm } from "./auto-submit-form";
import { BackButton } from "./back-button";
import { Button, ButtonVariants } from "./button";
import { Spinner } from "./spinner";
import { Translated } from "./translated";
import { CodeInput } from "./venho/code-input";

// either loginName or sessionId must be provided
type Props = {
  host: string | null;
  loginName?: string;
  sessionId?: string;
  requestId?: string;
  organization?: string;
  method: string;
  code?: string;
  loginSettings?: LoginSettings;
};

type Inputs = {
  code: string;
};

export function LoginOTP({ host, loginName, sessionId, requestId, organization, method, code, loginSettings }: Props) {
  const t = useTranslations("otp");

  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  const router = useRouter();

  const initialized = useRef(false);

  const { register, handleSubmit, formState, setValue, watch } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      code: code ? code : "",
    },
  });

  const updateSessionForOTPChallenge = useCallback(async (): Promise<{
    error?: string;
    [key: string]: any;
  }> => {
    let challenges;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

    if (method === "email") {
      challenges = create(RequestChallengesSchema, {
        otpEmail: {
          deliveryType: {
            case: "sendCode",
            value: host
              ? {
                  // VENHO FORK: ZITADEL caps this template at 200 runes, the same
                  // as the verification mail (see lib/url-template.ts). A device_
                  // requestId is a ~264-rune JWE, so appending it made the whole
                  // challenge fail with InvalidArgument and no OTP mail was ever
                  // sent. /otp/[method] recovers the requestId from the session
                  // cookie instead of carrying it in the link.
                  urlTemplate: appendRequestIdToUrlTemplate(
                    `${host.includes("localhost") ? "http://" : "https://"}${host}${basePath}/otp/${method}?code={{.Code}}&userId={{.UserID}}&sessionId={{.SessionID}}`,
                    requestId,
                  ),
                }
              : {},
          },
        },
      });
    }

    if (method === "sms") {
      challenges = create(RequestChallengesSchema, {
        otpSms: {},
      });
    }

    let response;
    try {
      response = await updateOrCreateSession({
        loginName,
        sessionId,
        organization,
        challenges,
        requestId,
      });
    } catch {
      return { error: "Could not request OTP challenge" };
    }

    if (response && "error" in response && response.error) {
      return { error: response.error };
    }

    return response;
  }, [method, host, requestId, loginName, sessionId, organization]);

  useEffect(() => {
    if (!initialized.current && ["email", "sms"].includes(method) && !code) {
      initialized.current = true;
      setLoading(true);
      updateSessionForOTPChallenge()
        .then((response) => {
          if (response?.error) {
            setError(response.error);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [updateSessionForOTPChallenge, method, code]);

  async function submitCode(values: Inputs, organization?: string) {
    setLoading(true);

    let body: any = {
      code: values.code,
      method,
    };

    if (organization) {
      body.organization = organization;
    }

    if (requestId) {
      body.requestId = requestId;
    }

    let checks;

    if (method === "sms") {
      checks = create(ChecksSchema, {
        otpSms: { code: values.code },
      });
    }
    if (method === "email") {
      checks = create(ChecksSchema, {
        otpEmail: { code: values.code },
      });
    }
    if (method === "time-based") {
      checks = create(ChecksSchema, {
        totp: { code: values.code },
      });
    }

    const response = await updateOrCreateSession({
      loginName,
      sessionId,
      organization,
      checks,
      requestId,
    })
      .catch(() => {
        setError("Could not verify OTP code");
        return;
      })
      .finally(() => {
        setLoading(false);
      });

    if (response && "error" in response && response.error) {
      setError(response.error);
      return;
    }

    return response;
  }

  function setCodeAndContinue(values: Inputs) {
    return submitCode(values, organization).then(async (response) => {
      if (response && "sessionId" in response) {
        setLoading(true);
        // Wait for 2 seconds to avoid eventual consistency issues with an OTP code being verified in the /login endpoint
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Use unified approach that handles both OIDC/SAML and regular flows
        if (response.factors?.user) {
          const callbackResponse = await completeFlowOrGetUrl(
            requestId && response.sessionId
              ? {
                  sessionId: response.sessionId,
                  requestId: requestId,
                  organization: response.factors?.user?.organizationId,
                }
              : {
                  loginName: response.factors.user.loginName,
                  organization: response.factors?.user?.organizationId,
                },
            loginSettings?.defaultRedirectUri,
          );
          setLoading(false);

          handleServerActionResponse(callbackResponse, router, setSamlData, setError);
        } else {
          setLoading(false);
        }
      }
    });
  }

  return (
    <>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <form className="w-full">
        <input type="hidden" data-testid="code-value" {...register("code", { required: t("verify.required.code") })} />

        <CodeInput
          value={watch("code") ?? ""}
          onChange={(next) => setValue("code", next, { shouldValidate: true, shouldDirty: true })}
          error={!!error}
          disabled={loading}
          autoFocus
          label={t("verify.labels.code")}
          data-testid="code-text-input"
        />

        {error && (
          <p className="text-warn-light-500 dark:text-warn-dark-500 mt-[8px] text-center text-sm" data-testid="error">
            {error}
          </p>
        )}

        <div className="mt-8 flex w-full flex-col gap-[16px]">
          <Button
            type="submit"
            className="h-[40px] w-full justify-center"
            variant={ButtonVariants.Primary}
            disabled={loading || !formState.isValid}
            onClick={handleSubmit(setCodeAndContinue)}
            data-testid="submit-button"
          >
            {loading && <Spinner className="mr-2 h-5 w-5" />} <Translated i18nKey="verify.submit" namespace="otp" />
          </Button>
          <BackButton data-testid="back-button" />
        </div>

        {["email", "sms"].includes(method) && (
          <div className="mt-[20px] flex w-full flex-row items-baseline justify-center gap-[4px] text-sm leading-5">
            <span className="text-text-light-secondary-500 dark:text-text-dark-secondary-500">
              <Translated i18nKey="verify.noCodeReceived" namespace="otp" />
            </span>
            <button
              aria-label="Resend OTP Code"
              disabled={loading}
              type="button"
              className="text-text-light-500 dark:text-text-dark-500 font-semibold hover:underline disabled:text-gray-400 dark:disabled:text-gray-700"
              onClick={async () => {
                setLoading(true);
                const response = await updateSessionForOTPChallenge();
                if (response?.error) {
                  setError(response.error);
                }
                setLoading(false);
              }}
              data-testid="resend-button"
            >
              <Translated i18nKey="verify.resendCode" namespace="otp" />
            </button>
          </div>
        )}
      </form>
    </>
  );
}
