import { DynamicTheme } from "@/components/dynamic-theme";
import { SessionsList } from "@/components/sessions-list";
import { Translated } from "@/components/translated";
import { ACCOUNT_TILE_CLASSES, AccountTileChevron } from "@/components/venho/account-tile";
import { getAllSessionCookieIds } from "@/lib/cookies";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings, getDefaultOrg, getUserByID, listSessions, ServiceConfig } from "@/lib/zitadel";
import { Organization } from "@zitadel/proto/zitadel/org/v2/org_pb";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
// import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accounts");
  return { title: t("title") };
}

async function loadSessions({ serviceConfig, organization }: { serviceConfig: ServiceConfig; organization?: string }) {
  const cookieIds = await getAllSessionCookieIds();

  if (cookieIds && cookieIds.length) {
    const response = await listSessions({
      serviceConfig,
      ids: cookieIds.filter((id) => !!id) as string[],
    });

    let sessions = response?.sessions ?? [];
    if (organization) {
      sessions = sessions.filter((s) => s.factors?.user?.organizationId === organization);
    }

    return sessions;
  } else {
    console.info("No session cookie found.");
    return [];
  }
}

export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const searchParams = await props.searchParams;

  const requestId = searchParams?.requestId;
  const organization = searchParams?.organization;
  const orgDomain = searchParams?.orgDomain;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  let defaultOrganization;
  if (!organization) {
    const org: Organization | null = await getDefaultOrg({ serviceConfig });
    if (org) {
      defaultOrganization = org.id;
    }
  }

  let sessions = await loadSessions({ serviceConfig, organization });

  // VENHO FORK: the designs show each account's profile picture where it has
  // one. The session carries only names, so look the user up — best-effort:
  // a lookup that fails leaves that tile on its initials.
  const avatarEntries = await Promise.all(
    sessions.map(async (session) => {
      const userId = session.factors?.user?.id;
      if (!userId) {
        return null;
      }
      try {
        const { user } = await getUserByID({ serviceConfig, userId });
        const avatarUrl = user?.type.case === "human" ? user.type.value.profile?.avatarUrl : undefined;
        return avatarUrl ? ([session.id, avatarUrl] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  const avatarUrlById: Record<string, string> = Object.fromEntries(
    avatarEntries.filter((entry): entry is readonly [string, string] => entry !== null),
  );

  const branding = await getBrandingSettings({ serviceConfig, organization: organization ?? defaultOrganization });

  const params = new URLSearchParams();

  if (requestId) {
    params.append("requestId", requestId);
  }

  if (organization) {
    params.append("organization", organization);
  }

  if (orgDomain) {
    params.append("orgDomain", orgDomain);
  }

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-3">
        <h1>
          <Translated i18nKey="title" namespace="accounts" />
        </h1>
        <p className="ztdl-p">
          <Translated i18nKey="description" namespace="accounts" />
        </p>
      </div>

      <div className="flex w-full flex-col gap-2">
        <SessionsList sessions={sessions} requestId={requestId} avatarUrlById={avatarUrlById} />
        <Link href={`/loginname?` + params} className={`${ACCOUNT_TILE_CLASSES} h-[76px]`} data-testid="add-another-account">
          <span className="text-text-light-500 dark:text-text-dark-500 flex-1 text-sm leading-5">
            <Translated i18nKey="addAnother" namespace="accounts" />
          </span>
          <AccountTileChevron />
        </Link>
      </div>
    </DynamicTheme>
  );
}
