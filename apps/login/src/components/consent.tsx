"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { approveDeviceAuthorization, denyDeviceAuthorization } from "@/lib/server/device";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { Button, ButtonVariants } from "./button";
import { Spinner } from "./spinner";
import { Translated } from "./translated";
import { ScopeList } from "./venho/scope-list";

/**
 * VENHO FORK — Allow is an action now, not a link.
 *
 * Upstream rendered Allow as an `<a>` to the login page and let a later GET on
 * `/signedin` bind the grant, so the click recorded nothing and the binding
 * needed no click at all. Both buttons now call a server action that approves
 * or denies there and then, against the session named on this page, and only
 * for a device authorization this browser started. See lib/server/device.ts.
 */
export function ConsentScreen({
  scope,
  requestId,
  sessionId,
  organization,
  appName,
  continueAs,
}: {
  scope?: string[];
  /** The `device_<id>` the flow carries; checked against this browser's cookie. */
  requestId: string;
  /** The authenticated session the grant will be issued to. */
  sessionId: string;
  organization?: string;
  appName?: string;
  /**
   * Login name of the signed-in account the grant will be issued to. Consent to
   * scopes is consent as an identity, so the screen says which one — and by the
   * time this screen renders there always is one.
   */
  continueAs?: string;
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const router = useRouter();

  async function run(action: () => Promise<{ redirect: string } | { error: string }>) {
    setError("");
    setLoading(true);

    const response = await action()
      .catch(() => {
        setError("Could not complete the request");
        return undefined;
      })
      .finally(() => {
        setLoading(false);
      });

    if (response) {
      handleServerActionResponse(response, router, () => {}, setError);
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
        <div className="w-full" data-testid="error">
          <Alert>{error}</Alert>
        </div>
      )}

      {continueAs && (
        <p className="ztdl-p text-center text-sm" data-testid="continue-as">
          <Translated i18nKey="request.continueAs" namespace="device" data={{ loginName: continueAs }} />
        </p>
      )}

      {/* Allow above Deny, both full width — the designs stack the actions
          rather than sitting them at opposite ends of a row. */}
      <div className="flex w-full flex-col gap-[16px]">
        <Button
          data-testid="submit-button"
          type="submit"
          disabled={loading}
          variant={ButtonVariants.Primary}
          className="h-[40px] w-full justify-center"
          onClick={() => run(() => approveDeviceAuthorization({ requestId, sessionId, organization }))}
        >
          {loading && <Spinner className="mr-2 h-5 w-5" />}
          <Translated i18nKey="request.submit" namespace="device" />
        </Button>

        <Button
          onClick={() => run(() => denyDeviceAuthorization({ requestId }))}
          disabled={loading}
          variant={ButtonVariants.Ghost}
          data-testid="deny-button"
          className="h-[40px] w-full justify-center"
        >
          <Translated i18nKey="request.deny" namespace="device" />
        </Button>
      </div>

      <p className="ztdl-p text-center text-xs">
        <Translated i18nKey="request.disclaimer" namespace="device" data={{ appName: appName }} />
      </p>
    </div>
  );
}
