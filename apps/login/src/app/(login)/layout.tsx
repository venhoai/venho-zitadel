import "@/styles/globals.scss";

import { BackgroundWrapper } from "@/components/background-wrapper";
import { LanguageProvider } from "@/components/language-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Skeleton } from "@/components/skeleton";
import { ThemeProvider } from "@/components/theme-provider";
import { BrandLogo } from "@/components/venho/brand-logo";
import { LANGS, getLanguage } from "@/lib/i18n";
import { getServiceConfig } from "@/lib/service-url";
import { getAllowedLanguages } from "@/lib/zitadel";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Geist, Manrope } from "next/font/google";
import { headers } from "next/headers";
import React, { Suspense } from "react";

// VENHO FORK: the login designs use two families — Geist for UI text and
// controls (`font-font-sans-alt` in Figma) and Manrope for headings
// (`font-font-sans`, the desktop app's own face). Both are pulled through
// next/font, so they are self-hosted at build time: a login page must not make
// a request to fonts.gstatic.com on the user's behalf.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-venho-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-venho-display",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return { title: t("title") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  let languages = LANGS;
  try {
    const settings = await getAllowedLanguages({ serviceConfig });
    if (settings.allowedLanguages?.length) {
      languages = settings.allowedLanguages
        .filter((code) => LANGS.find((l) => l.code === code))
        .map((code) => getLanguage(code));
    }
  } catch (e) {
    console.error("Failed to load supported languages", e);
  }

  return (
    // VENHO FORK: `dark` is set here, server-side, as well as by next-themes'
    // pre-paint script (see ThemeProvider). Belt and braces on purpose — the
    // class is then present in the very first byte of HTML, so there is no
    // light flash before hydration and the page is still dark with JS disabled.
    // `colorScheme` carries it into the UA's own chrome: form controls,
    // scrollbars and autofill.
    <html
      className={`${geist.variable} ${manrope.variable} ${geist.className} dark`}
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head />
      <body>
        <ThemeProvider>
          <Tooltip.Provider>
            <Suspense
              fallback={
                <BackgroundWrapper
                  className={`bg-background-light-600 dark:bg-background-dark-600 relative flex min-h-screen flex-col`}
                >
                  <div className="absolute top-[32px] left-[32px] z-10">
                    <BrandLogo />
                  </div>
                  <div className="relative mx-auto w-full max-w-[380px] px-4 pt-[140px] pb-8">
                    <Skeleton>
                      <div className="h-40"></div>
                    </Skeleton>
                  </div>
                </BackgroundWrapper>
              }
            >
              <LanguageProvider>
                <BackgroundWrapper
                  className={`bg-background-light-600 dark:bg-background-dark-600 relative flex min-h-screen flex-col`}
                >
                  {/* VENHO FORK: the brand mark is page chrome, pinned to the
                      top-left on every screen, rather than something each page
                      or the card draws for itself. */}
                  <div className="absolute top-[32px] left-[32px] z-10">
                    <BrandLogo />
                  </div>

                  {/* The designs sit the column near the top of the viewport
                      (~140px), not vertically centred, so the form does not
                      jump as its height changes between steps. */}
                  <div className="relative mx-auto w-full max-w-[1100px] px-4 pt-[140px] pb-8">
                    <div>{children}</div>

                    {/* Language stays available but out of the way. There is
                        no theme switch: the app is dark-only (ThemeProvider
                        forces it), and no light screens were designed. */}
                    <div className="mx-auto mt-8 flex max-w-[380px] flex-row items-center justify-center px-4">
                      <LanguageSwitcher languages={languages} />
                    </div>
                  </div>
                </BackgroundWrapper>
              </LanguageProvider>
            </Suspense>
          </Tooltip.Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
