import { Alert } from "@/components/alert";
import { DynamicTheme } from "@/components/dynamic-theme";
import { RegisterForm } from "@/components/register-form";
import { Translated } from "@/components/translated";
import { getAllSessionCookieIds } from "@/lib/cookies";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings, getDefaultOrg, getLoginSettings, getPasswordComplexitySettings } from "@/lib/zitadel";
import { Organization } from "@zitadel/proto/zitadel/org/v2/org_pb";
import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("register");
  return { title: t("title") };
}

export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const searchParams = await props.searchParams;

  let { firstname, lastname, email, organization, requestId } = searchParams;
  // The organization as the caller gave it, for links back into the flow;
  // `organization` itself falls back to the default org below.
  const requestedOrganization = organization;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  if (!organization) {
    const org: Organization | null = await getDefaultOrg({ serviceConfig });
    if (org) {
      organization = org.id;
    }
  }

  const passwordComplexitySettings = await getPasswordComplexitySettings({ serviceConfig, organization });
  const branding = await getBrandingSettings({ serviceConfig, organization });
  const loginSettings = await getLoginSettings({ serviceConfig, organization });

  // VENHO FORK: "Already have an account? Log in" goes where Get started's
  // does — the account picker when this browser holds sessions.
  const params = new URLSearchParams();
  if (requestId) {
    params.set("requestId", requestId);
  }
  if (requestedOrganization) {
    params.set("organization", requestedOrganization);
  }
  const sessionIds = await getAllSessionCookieIds();
  const loginHref = (sessionIds?.length ? "/accounts?" : "/loginname?") + params;

  if (!loginSettings) {
    return (
      <DynamicTheme branding={branding}>
        <div className="flex flex-col space-y-4">
          <h1>
            <Translated i18nKey="title" namespace="register" />
          </h1>
          <Alert>
            <Translated i18nKey="unknownContext" namespace="error" />
          </Alert>
        </div>
        <div className="w-full"></div>
      </DynamicTheme>
    );
  }

  const canSignUp =
    loginSettings.allowRegister &&
    (loginSettings.allowLocalAuthentication || loginSettings.passkeysType === PasskeysType.ALLOWED);

  if (!canSignUp) {
    return (
      <DynamicTheme branding={branding}>
        <div className="flex flex-col space-y-4">
          <h1>
            <Translated i18nKey="disabled.title" namespace="register" />
          </h1>
          <p className="ztdl-p">
            <Translated i18nKey="disabled.description" namespace="register" />
          </p>
        </div>
        <div className="w-full"></div>
      </DynamicTheme>
    );
  }

  // VENHO FORK: the designs give sign-up a heading and nothing else, and no
  // external providers — those are on Get started (/signup), one step back.
  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col">
        <h1>
          <Translated i18nKey="title" namespace="register" />
        </h1>
      </div>

      <div className="w-full">
        {!organization ? (
          <Alert>
            <Translated i18nKey="unknownContext" namespace="error" />
          </Alert>
        ) : (
          <RegisterForm
            organization={organization}
            firstname={firstname}
            lastname={lastname}
            email={email}
            requestId={requestId}
            loginSettings={loginSettings}
            passwordComplexitySettings={passwordComplexitySettings}
            loginHref={loginHref}
          />
        )}
      </div>
    </DynamicTheme>
  );
}
