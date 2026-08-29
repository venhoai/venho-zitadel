"use client";

import { completeDeviceAuthorization } from "@/lib/server/device";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { Button, ButtonVariants } from "./button";
import { Spinner } from "./spinner";
import { Translated } from "./translated";
import { ScopeList } from "./venho/scope-list";

export function ConsentScreen({
  scope,
  nextUrl,
  deviceAuthorizationRequestId,
  appName,
}: {
  scope?: string[];
  nextUrl: string;
  deviceAuthorizationRequestId: string;
  appName?: string;
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const router = useRouter();

  async function denyDeviceAuth() {
    setLoading(true);
    const response = await completeDeviceAuthorization(deviceAuthorizationRequestId)
      .catch(() => {
        setError("Could not register user");
        return;
      })
      .finally(() => {
        setLoading(false);
      });

    if (response) {
      return router.push("/device");
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-[32px] pt-4">
      {/* VENHO FORK: upstream rendered a bulleted list whose text came from a
          translation lookup that silently resolved to "" for any scope it did
          not know — including the two reserved audience scopes venho-desktop
          asks for, which showed as blank rows. See venho/scopes.ts. */}
      <ScopeList scopes={scope} appName={appName} />

      {error && (
        <div className="w-full">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Allow above Deny, both full width — the designs stack the actions
          rather than sitting them at opposite ends of a row. */}
      <div className="flex w-full flex-col gap-[16px]">
        <Link href={nextUrl} className="w-full">
          <Button
            data-testid="submit-button"
            type="submit"
            variant={ButtonVariants.Primary}
            className="h-[40px] w-full justify-center"
          >
            <Translated i18nKey="request.submit" namespace="device" />
          </Button>
        </Link>

        <Button
          onClick={() => {
            denyDeviceAuth();
          }}
          variant={ButtonVariants.Ghost}
          data-testid="deny-button"
          className="h-[40px] w-full justify-center"
        >
          {loading && <Spinner className="mr-2 h-5 w-5" />}
          <Translated i18nKey="request.deny" namespace="device" />
        </Button>
      </div>

      <p className="ztdl-p text-center text-xs">
        <Translated i18nKey="request.disclaimer" namespace="device" data={{ appName: appName }} />
      </p>
    </div>
  );
}
