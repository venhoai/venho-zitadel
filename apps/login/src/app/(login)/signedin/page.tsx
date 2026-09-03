import { Button, ButtonVariants } from "@/components/button";
import { DynamicTheme } from "@/components/dynamic-theme";
import { Translated } from "@/components/translated";
import { UserAvatar } from "@/components/user-avatar";
import { CloseWindowButton } from "@/components/venho/close-window-button";
import { StatusPanel } from "@/components/venho/status-panel";
import { resolveRedirectUri } from "@/lib/client";
import { getSessionCookieById } from "@/lib/cookies";
import { getServiceConfig } from "@/lib/service-url";
import { loadMostRecentSession } from "@/lib/session";
import { getBrandingSettings, getLoginSettings, getSession, ServiceConfig } from "@/lib/zitadel";
import { Ban, Check } from "lucide-react";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signedin");
  return { title: t("title", { user: "" }) };
}

async function loadSessionById(serviceConfig: ServiceConfig, sessionId: string, organization?: string) {
  const recent = await getSessionCookieById({ sessionId, organization });

  if (!recent) {
    return undefined;
  }

  return getSession({ serviceConfig, sessionId: recent.id, sessionToken: recent.token }).then((response) => {
    if (response?.session) {
      return response.session;
    }
  });
}

export default async function Page(props: { searchParams: Promise<any> }) {
  const searchParams = await props.searchParams;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const { loginName, requestId, organization, sessionId, result } = searchParams;

  const branding = await getBrandingSettings({ serviceConfig, organization });

  const isDeviceRequest = !!requestId && requestId.startsWith("device_");

  // VENHO FORK: the device grant ends here, and it ends for good — the browser
  // has nothing left to do and the user's attention belongs back on the device
  // that sent them. Upstream showed "Welcome {user}!", an account dropdown and
  // an untranslated hardcoded English notice; the designs show a single
  // terminal panel. Everything else on this page (the redirect button, the
  // avatar) only makes sense for a flow that continues in the browser.
  //
  // This page used also to APPROVE the grant, as a side effect of being loaded
  // — so a link was enough to bind a device to any signed-in browser that
  // opened it, with no consent screen in between. Approval now happens in the
  // consent action, after authentication (lib/server/device.ts), and what is
  // left here is a receipt: it changes nothing, and says only what the action
  // already decided.
  if (isDeviceRequest) {
    const denied = result === "denied";

    return (
      <DynamicTheme branding={branding}>
        <StatusPanel
          icon={denied ? Ban : Check}
          title={<Translated i18nKey={denied ? "device.denied.title" : "device.title"} namespace="signedin" />}
          description={
            <Translated i18nKey={denied ? "device.denied.description" : "device.description"} namespace="signedin" />
          }
          action={<CloseWindowButton />}
        />
      </DynamicTheme>
    );
  }

  const sessionFactors = sessionId
    ? await loadSessionById(serviceConfig, sessionId, organization)
    : await loadMostRecentSession({ serviceConfig, sessionParams: { loginName, organization } });

  let loginSettings;
  if (!requestId) {
    loginSettings = await getLoginSettings({ serviceConfig, organization });
  }

  const redirectUri = await resolveRedirectUri(
    requestId && sessionId ? { sessionId, requestId } : { loginName: loginName ?? sessionFactors?.factors?.user?.loginName },
    loginSettings?.defaultRedirectUri,
  );

  const isSamePage = redirectUri?.startsWith("/signedin") ?? false;

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-4">
        <h1>
          <Translated i18nKey="title" namespace="signedin" data={{ user: sessionFactors?.factors?.user?.displayName }} />
        </h1>
        <p className="ztdl-p mb-6 block">
          <Translated i18nKey="description" namespace="signedin" />
        </p>

        <UserAvatar
          loginName={loginName ?? sessionFactors?.factors?.user?.loginName}
          displayName={sessionFactors?.factors?.user?.displayName ?? loginName}
          showDropdown
          searchParams={searchParams}
        />
      </div>

      {/* VENHO FORK: the two endings this page can have, and it always had
          only one of them. With somewhere to go, Continue is a LINK and the
          flow carries on in the browser — upstream's behaviour, untouched.
          With nowhere to go (resolveRedirectUri falls back to /signedin
          itself, so `isSamePage` is the common case for a plain sign-in) the
          page was a dead end: a welcome message, an avatar, and no way out.
          It now gets the same terminal action as the device grant. */}
      <div className="w-full">
        {redirectUri && !isSamePage ? (
          <div className="mt-8 flex w-full flex-row items-center">
            <span className="flex-grow"></span>

            <Link href={redirectUri}>
              <Button type="submit" className="self-end" variant={ButtonVariants.Primary}>
                <Translated i18nKey="continue" namespace="signedin" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="mt-8 w-full">
            <CloseWindowButton />
          </div>
        )}
      </div>
    </DynamicTheme>
  );
}
