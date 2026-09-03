"use client";

import { Alert } from "@/components/alert";
import { handleServerActionResponse } from "@/lib/client-utils";
import { startDeviceAuthorization } from "@/lib/server/device";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { BackButton } from "./back-button";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";
import { Spinner } from "./spinner";
import { Translated } from "./translated";

type Inputs = {
  userCode: string;
};

export function DeviceCodeForm({ userCode }: { userCode?: string }) {
  const router = useRouter();

  const { register, handleSubmit, formState } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      userCode: userCode || "",
    },
  });

  const t = useTranslations("device");

  const [error, setError] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);

  // VENHO FORK: submitting the code no longer goes to consent. It pairs the
  // request with this browser (an httpOnly cookie — see lib/device.ts) and
  // hands back the identity step, because consent is a decision about which
  // account gets bound to the device and there is no account here yet. The
  // server picks that step: the account picker when the browser already holds
  // sessions, the login name screen when it does not.
  async function submitCodeAndContinue(value: Inputs): Promise<boolean | void> {
    setError("");
    setLoading(true);

    const response = await startDeviceAuthorization(value.userCode)
      .catch(() => {
        setError(t("usercode.error"));
        return;
      })
      .finally(() => {
        setLoading(false);
      });

    if (!response) {
      setError(t("usercode.error"));
      return;
    }

    handleServerActionResponse(response, router, () => {}, setError);
  }

  return (
    <>
      <form className="w-full">
        <div className="mt-4">
          <TextInput
            type="text"
            autoComplete="one-time-code"
            autoFocus
            {...register("userCode", { required: t("usercode.required.code") })}
            label={t("usercode.labels.code")}
            data-testid="code-text-input"
          />
        </div>

        {error && (
          <div className="py-4" data-testid="error">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="mt-8 flex w-full flex-col gap-[16px]">
          <Button
            type="submit"
            className="h-[40px] w-full justify-center"
            variant={ButtonVariants.Primary}
            disabled={loading || !formState.isValid}
            onClick={handleSubmit(submitCodeAndContinue)}
            data-testid="submit-button"
          >
            {loading && <Spinner className="mr-2 h-5 w-5" />} <Translated i18nKey="usercode.submit" namespace="device" />
          </Button>
          <BackButton />
        </div>
      </form>
    </>
  );
}
