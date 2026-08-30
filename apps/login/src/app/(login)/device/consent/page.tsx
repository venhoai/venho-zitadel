import { ConsentScreen } from "@/components/consent";
import { DynamicTheme } from "@/components/dynamic-theme";
import { Translated } from "@/components/translated";
import { getAllSessions } from "@/lib/cookies";
import { createLogger } from "@/lib/logger";
import { getServiceConfig } from "@/lib/service-url";
import { findValidSession } from "@/lib/session";
import { getBrandingSettings, getDefaultOrg, getDeviceAuthorizationRequest, listSessions } from "@/lib/zitadel";
import { Organization } from "@zitadel/proto/zitadel/org/v2/org_pb";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { headers } from "next/headers";

const logger = createLogger("device-consent");

export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const searchParams = await props.searchParams;

  const userCode = searchParams?.user_code;
  const requestId = searchParams?.requestId;
  const organization = searchParams?.organization;

  if (!userCode || !requestId) {
    return (
      <div>
        <Translated i18nKey="noUserCode" namespace="error" />
      </div>
    );
  }

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const { deviceAuthorizationRequest } = await getDeviceAuthorizationRequest({ serviceConfig, userCode });

  if (!deviceAuthorizationRequest) {
    return (
      <div>
        <Translated i18nKey="noDeviceRequest" namespace="error" />
      </div>
    );
  }

  let defaultOrganization;
  if (!organization) {
    const org: Organization | null = await getDefaultOrg({ serviceConfig });
    if (org) {
      defaultOrganization = org.id;
    }
  }

  const branding = await getBrandingSettings({ serviceConfig, organization: organization ?? defaultOrganization });

  // VENHO FORK: reuse the session the browser already holds. Upstream sends
  // every device grant through /loginname after consent, even when the user
  // approved it seconds after signing in on this very browser — the /login
  // route does session reuse for oidc_ and saml_ requests but deliberately
  // punts device_ to this page, and this page never looked. So: find a valid
  // session (findValidSession applies the same checks as everywhere else —
  // MFA and email verification included, so an account the gate would bounce
  // is NOT silently reused), and if there is one, Allow completes the grant
  // as that user via /signedin, which already knows how to finish a device
  // request from a session cookie. No valid session ⇒ the upstream path,
  // unchanged.
  let validSession: Session | undefined;
  const sessionCookies = await getAllSessions();
  if (sessionCookies.length) {
    try {
      const { sessions } = (await listSessions({
        serviceConfig,
        ids: sessionCookies.map((s) => s.id).filter((id) => !!id),
      })) ?? { sessions: [] };
      validSession = await findValidSession({ serviceConfig, sessions: sessions ?? [], organization });
    } catch (error) {
      // Stale cookie ids or a transient API error must not break consent —
      // fall back to the sign-in path, exactly as /login does.
      logger.warn("could not evaluate existing sessions; falling back to login", { error });
    }
  }

  const params = new URLSearchParams();

  if (requestId) {
    params.append("requestId", requestId);
  }

  if (validSession) {
    // No organization param here: /signedin looks the cookie up by id, and an
    // organization filter that does not match the cookie's stored value would
    // make the lookup miss a session we just validated.
    params.append("sessionId", validSession.id);
  } else if (organization) {
    params.append("organization", organization);
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
          deviceAuthorizationRequestId={deviceAuthorizationRequest?.id}
          scope={deviceAuthorizationRequest.scope}
          appName={deviceAuthorizationRequest?.appName}
          nextUrl={(validSession ? `/signedin?` : `/loginname?`) + params}
          continueAs={validSession?.factors?.user?.loginName}
        />
      </div>
    </DynamicTheme>
  );
}
