import { ButtonColors, ButtonSizes, ButtonVariants, getButtonClasses } from "@/components/button";
import { DynamicTheme } from "@/components/dynamic-theme";
import { SignInWithIdp } from "@/components/sign-in-with-idp";
import { Translated } from "@/components/translated";
import { LoginPrompt } from "@/components/venho/login-prompt";
import { getAllSessionCookieIds } from "@/lib/cookies";
import { getServiceConfig } from "@/lib/service-url";
import { getActiveIdentityProviders, getBrandingSettings, getDefaultOrg, getLoginSettings } from "@/lib/zitadel";
import { clsx } from "clsx";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signup");
  return { title: t("title") };
}

/**
 * VENHO FORK — "Get started", the front door for someone without an account
 * (Figma "Venho new Sidebar UI", frame 1629:33983).
 *
 * One choice per way in: email (the existing /register form) or each external
 * IdP that may create accounts. "Log in" leads to the account picker when this
 * browser already holds sessions, and to the login name screen when it does
 * not. Reached from the desktop's "Get started" (a device grant with
 * intent=signup), from "Sign up" on the login screen, and from an OIDC
 * `prompt=create`.
 */
export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const searchParams = await props.searchParams;
  const { requestId, organization } = searchParams;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  let orgId = organization;
  if (!orgId) {
    const org = await getDefaultOrg({ serviceConfig });
    orgId = org?.id;
  }

  const params = new URLSearchParams();
  if (requestId) {
    params.set("requestId", requestId);
  }
  if (organization) {
    params.set("organization", organization);
  }

  const sessionIds = await getAllSessionCookieIds();
  const loginHref = (sessionIds?.length ? "/accounts?" : "/loginname?") + params;

  const loginSettings = await getLoginSettings({ serviceConfig, organization: orgId });

  const identityProviders = loginSettings?.allowExternalIdp
    ? await getActiveIdentityProviders({ serviceConfig, orgId }).then((resp) =>
        // The same filter as /register: only providers that can make an account.
        resp.identityProviders.filter((idp) => idp.options?.isAutoCreation || idp.options?.isCreationAllowed),
      )
    : [];

  const withEmail = !!(loginSettings?.allowRegister && loginSettings?.allowLocalAuthentication);

  // Nothing to sign up with: this page has no purpose, and the login screen
  // already says what the instance allows.
  if (!withEmail && !identityProviders.length) {
    redirect(loginHref);
  }

  const branding = await getBrandingSettings({ serviceConfig, organization: orgId });

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-3">
        <h1>
          <Translated i18nKey="title" namespace="signup" />
        </h1>
        <p className="ztdl-p">
          <Translated i18nKey="description" namespace="signup" />
        </p>
      </div>

      <div className="flex w-full flex-col gap-8">
        <div className="flex w-full flex-col gap-4">
          {withEmail && (
            <Link
              href={"/register?" + params}
              data-testid="signup-email"
              className={clsx(
                getButtonClasses(ButtonSizes.Small, ButtonVariants.Primary, ButtonColors.Primary),
                "h-[40px] w-full justify-center font-medium shadow-xs",
              )}
            >
              <Translated i18nKey="continueWithEmail" namespace="signup" />
            </Link>
          )}

          {!!identityProviders.length && (
            <SignInWithIdp
              identityProviders={identityProviders}
              requestId={requestId}
              organization={organization}
              postErrorRedirectUrl="/signup"
              showLabel={withEmail}
            />
          )}
        </div>

        <LoginPrompt href={loginHref} />
      </div>
    </DynamicTheme>
  );
}
