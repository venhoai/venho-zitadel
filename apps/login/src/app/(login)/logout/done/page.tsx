import { DynamicTheme } from "@/components/dynamic-theme";
import { Translated } from "@/components/translated";
import { CloseWindowButton } from "@/components/venho/close-window-button";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings } from "@/lib/zitadel";
import { headers } from "next/headers";

export default async function Page(props: { searchParams: Promise<any> }) {
  const searchParams = await props.searchParams;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const { organization } = searchParams;

  const branding = await getBrandingSettings({ serviceConfig, organization });

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-4">
        <h1>
          <Translated i18nKey="success.title" namespace="logout" />
        </h1>
        <p className="ztdl-p mb-6 block">
          <Translated i18nKey="success.description" namespace="logout" />
        </p>
      </div>
      {/* VENHO FORK: upstream ends the logout flow on an empty action slot —
          a success message with nothing to press. Same terminal action as the
          other two endings. */}
      <div className="w-full">
        <CloseWindowButton />
      </div>
    </DynamicTheme>
  );
}
