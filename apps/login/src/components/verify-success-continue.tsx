"use client";

import { useLeavingRouter } from "@/lib/use-leaving-router";
import { useTranslations } from "next-intl";
import { Button, ButtonVariants } from "./button";
import { Spinner } from "./spinner";

type Props = {
  continueUrl: string;
};

export function VerifySuccessContinue({ continueUrl }: Props) {
  const { router, navigating } = useLeavingRouter();
  const t = useTranslations("verify");

  return (
    <div className="mt-8 flex w-full flex-row items-center justify-end">
      <Button
        type="button"
        variant={ButtonVariants.Primary}
        onClick={() => router.push(continueUrl)}
        disabled={navigating}
        data-testid="continue-button"
      >
        {navigating && <Spinner className="mr-2 h-5 w-5" />}
        {t("successContinue")}
      </Button>
    </div>
  );
}
