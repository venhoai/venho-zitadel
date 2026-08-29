import { LANGS, LANGUAGE_COOKIE_NAME, LANGUAGE_HEADER_NAME } from "@/lib/i18n";
import { getServiceConfig } from "@/lib/service-url";
import { getAllowedLanguages, getHostedLoginTranslation } from "@/lib/zitadel";
import { JsonObject } from "@zitadel/client";
import deepmerge from "deepmerge";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export default getRequestConfig(async () => {
  const fallback = "en";
  const cookiesList = await cookies();

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  let allowedLanguages = LANGS.map((l) => l.code);
  let defaultLanguage = fallback;

  try {
    const settings = await getAllowedLanguages({ serviceConfig });
    if (settings.allowedLanguages?.length) {
      const localLanguageCodes = LANGS.map((l) => l.code);
      allowedLanguages = settings.allowedLanguages.filter((l) => localLanguageCodes.includes(l));
    }
    if (settings.defaultLanguage) {
      defaultLanguage = settings.defaultLanguage;
    }
  } catch (e) {
    console.warn("Failed to load global settings", e);
  }

  let locale: string = defaultLanguage;

  const languageHeader = await (await headers()).get(LANGUAGE_HEADER_NAME);
  if (languageHeader) {
    // splits "en-US,en;q=0.9" to ["en", "US"] or ["en"]
    const headerLocale = languageHeader.split(",")[0].split("-")[0];
    if (allowedLanguages.includes(headerLocale)) {
      locale = headerLocale;
    }
  }

  const languageCookie = cookiesList?.get(LANGUAGE_COOKIE_NAME);
  if (languageCookie && languageCookie.value) {
    if (allowedLanguages.includes(languageCookie.value)) {
      locale = languageCookie.value;
    } else {
      // If the cookie tells a language that is other than the supported ones, fall back to the default.
      locale = defaultLanguage;
    }
  }

  const i18nOrganization = _headers.get("x-zitadel-i18n-organization") || ""; // You may need to set this header in middleware

  let translations: JsonObject | Record<string, never> = {};
  try {
    const i18nJSON = await getHostedLoginTranslation({
      serviceConfig,
      locale,
      organization: i18nOrganization,
    });

    if (i18nJSON) {
      translations = i18nJSON;
    }
  } catch (error) {
    console.warn("Error fetching custom translations:", error);
  }

  const customMessages = translations;

  // Load locale messages, fall back to default language messages if locale not found
  let localeMessages;
  try {
    localeMessages = (await import(`../../locales/${locale}.json`)).default;
  } catch {
    try {
      localeMessages = (await import(`../../locales/${defaultLanguage}.json`)).default;
    } catch {
      localeMessages = (await import(`../../locales/${fallback}.json`)).default;
    }
  }

  const fallbackMessages = (await import(`../../locales/${fallback}.json`)).default;

  /**
   * VENHO FORK — product copy, merged last.
   *
   * `customMessages` is the instance's hosted-login translation blob, and
   * ZITADEL pre-populates it with a COMPLETE copy of its own defaults, not just
   * the strings an operator has overridden. Merged at the highest priority as
   * upstream does, that blob fully shadows locales/<locale>.json — so editing
   * those files can add a brand-new key but can never change a string ZITADEL
   * already ships. Every heading in our designs is such a string.
   *
   * So the strings that are the product's own identity live here instead, in
   * locales/venho/, and win. Everything we have not deliberately claimed still
   * comes from the layers below, which keeps upstream's translations and any
   * future copy fixes flowing through.
   *
   * English is applied under the active locale for the same reason `en.json` is
   * the base: an untranslated Venho string should read as English, not as a raw
   * key.
   */
  const venhoFallback = (await import(`../../locales/venho/${fallback}.json`)).default;
  let venhoMessages: JsonObject | Record<string, never> = {};
  if (locale !== fallback) {
    try {
      venhoMessages = (await import(`../../locales/venho/${locale}.json`)).default;
    } catch {
      // No Venho copy translated for this locale yet — English stands in.
    }
  }

  return {
    locale,
    messages: deepmerge.all([fallbackMessages, localeMessages, customMessages, venhoFallback, venhoMessages]) as Record<
      string,
      string
    >,
  };
});
