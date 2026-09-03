import { ConsentScreen } from "@/components/consent";
import { DynamicTheme } from "@/components/dynamic-theme";
import { Translated } from "@/components/translated";
import { StatusPanel } from "@/components/venho/status-panel";
import { getSessionCookieById, getSessionCookieByLoginName } from "@/lib/cookies";
import { getPendingDeviceAuthorization } from "@/lib/device";
import { createLogger } from "@/lib/logger";
import { getServiceConfig } from "@/lib/service-url";
import { isSessionValid } from "@/lib/session";
import { getBrandingSettings, getDefaultOrg, getDeviceAuthorizationRequest, getSession } from "@/lib/zitadel";
import { Organization } from "@zitadel/proto/zitadel/org/v2/org_pb";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { TimerOff } from "lucide-react";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * VENHO FORK — consent, moved to where it belongs: after the user has signed in.
 *
 * Upstream's Login V2 renders this screen straight off `/device`, before anyone
 * has identified themselves, and its Allow button is a link to the login page.
 * The user therefore approves scopes for an account they have not chosen yet,
 * nothing records that they approved anything, and the grant is really bound
 * later by a GET on `/signedin` — which means a link is enough to bind a device
 * to a signed-in victim. ZITADEL's own legacy login refuses to render
 * approve/deny until authentication is complete
 * (`handleDeviceAuthAction`, internal/api/ui/login/device_auth.go); this is
 * that ordering restored for v2.
 *
 * Everything the page needs must therefore be true at once: this browser
 * started the device authorization (lib/device.ts), it holds a session cookie,
 * and that session passes the same `isSessionValid` gate the rest of the flow
 * uses. Anything missing sends the user to authenticate rather than showing a
 * decision they cannot yet meaningfully make.
 */

const logger = createLogger("device-consent");

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("device");
  return { title: t("request.title", { appName: "" }) };
}

function ExpiredPanel({ branding }: { branding: any }) {
  return (
    <DynamicTheme branding={branding}>
      <StatusPanel
        icon={TimerOff}
        title={<Translated i18nKey="expired.title" namespace="device" />}
        description={<Translated i18nKey="expired.description" namespace="device" />}
      />
    </DynamicTheme>
  );
}

export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const searchParams = await props.searchParams;

  const requestId = searchParams?.requestId;
  const sessionId = searchParams?.sessionId;
  const loginName = searchParams?.loginName;
  const organization = searchParams?.organization;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  let defaultOrganization;
  if (!organization) {
    const org: Organization | null = await getDefaultOrg({ serviceConfig });
    if (org) {
      defaultOrganization = org.id;
    }
  }

  const branding = await getBrandingSettings({ serviceConfig, organization: organization ?? defaultOrganization });

  // The pairing this browser wrote when the user submitted the code. Its
  // absence is the whole point: a requestId someone else minted cannot be
  // consented to here, because the user code it maps to is not in this cookie.
  const pending = requestId?.startsWith("device_") ? await getPendingDeviceAuthorization(requestId) : undefined;

  if (!pending) {
    logger.warn("no device authorization pending in this browser for that requestId", { requestId });
    return <ExpiredPanel branding={branding} />;
  }

  const { deviceAuthorizationRequest } = await getDeviceAuthorizationRequest({
    serviceConfig,
    userCode: pending.userCode,
  }).catch((error) => {
    // A device code lives five minutes by default
    // (ZITADEL_OIDC_DEVICEAUTH_LIFETIME), and signing up inside that window is
    // tight — so an expired request here is an ordinary outcome, not a fault.
    logger.warn("the device authorization request is gone", { error });
    return { deviceAuthorizationRequest: undefined };
  });

  if (!deviceAuthorizationRequest) {
    return <ExpiredPanel branding={branding} />;
  }

  // Whoever the flow says signed in, checked against what this browser actually
  // holds. `getSessionCookieById` is the only source of a session token, so an
  // id that is not in the cookie yields nothing to approve with.
  const cookie = sessionId
    ? await getSessionCookieById({ sessionId, organization })
    : loginName
      ? await getSessionCookieByLoginName({ loginName, organization })
      : undefined;

  let session: Session | undefined;
  if (cookie) {
    session = await getSession({ serviceConfig, sessionId: cookie.id, sessionToken: cookie.token })
      .then((response) => response.session)
      .catch((error) => {
        logger.warn("could not load the session backing this consent", { error });
        return undefined;
      });
  }

  if (!cookie || !session || !(await isSessionValid({ serviceConfig, session }))) {
    // No usable identity yet — or one the gate would bounce (unverified email,
    // MFA outstanding). Authenticate first; the flow returns here afterwards.
    const params = new URLSearchParams({ requestId: requestId! });
    if (organization) {
      params.append("organization", organization);
    }
    redirect("/loginname?" + params);
  }

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-4">
        <h1>
          <Translated i18nKey="request.title" namespace="device" data={{ appName: deviceAuthorizationRequest?.appName }} />
        </h1>

        <p className="ztdl-p">
          <Translated
            i18nKey="request.description"
            namespace="device"
            data={{ appName: deviceAuthorizationRequest?.appName }}
          />
        </p>
      </div>

      <div className="w-full">
        <ConsentScreen
          requestId={requestId!}
          sessionId={cookie.id}
          organization={organization}
          scope={deviceAuthorizationRequest.scope}
          appName={deviceAuthorizationRequest?.appName}
          continueAs={session.factors?.user?.loginName ?? cookie.loginName}
        />
      </div>
    </DynamicTheme>
  );
}
