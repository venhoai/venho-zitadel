"use client";

import { processIDPCallback } from "@/lib/server/idp-intent";
import { useLeavingRouter } from "@/lib/use-leaving-router";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Spinner } from "./spinner";

type Props = {
  provider: string;
  id: string;
  token: string;
  requestId?: string;
  organization?: string;
  link?: string;
  sessionId?: string;
  linkFingerprint?: string;
  postErrorRedirectUrl?: string;
};

/**
 * Client component that handles IDP callback processing.
 * Must be client-side to allow cookie modifications via server actions.
 */
export function IdpProcessHandler({
  provider,
  id,
  token,
  requestId,
  organization,
  link,
  sessionId,
  linkFingerprint,
  postErrorRedirectUrl,
}: Props) {
  const t = useTranslations("idp");
  const [submitting, setSubmitting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const executedRef = useRef(false);
  const { router, navigating } = useLeavingRouter();
  const loading = submitting || navigating;

  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (executedRef.current) {
      return;
    }

    executedRef.current = true;

    console.log("[IDP Process Handler] Starting IDP callback processing from client");

    processIDPCallback({
      provider,
      id,
      token,
      requestId,
      organization,
      sessionId,
      linkFingerprint,
      postErrorRedirectUrl,
    })
      .then((result) => {
        if (result.error) {
          console.error("[IDP Process Handler] Error:", result.error);
          setError(result.error);
          setSubmitting(false);
          return;
        }

        if (result.redirect) {
          console.log("[IDP Process Handler] Redirecting to:", result.redirect);
          router.push(result.redirect);
          return;
        }

        if (result.samlData) {
          console.log("[IDP Process Handler] Received samlData, rendering AutoSubmitForm");
          router.hold();
          setSamlData(result.samlData);
          setSubmitting(false);
          return;
        }

        setError(t("processing.noRedirect"));
        setSubmitting(false);
      })
      .catch((err) => {
        console.error("[IDP Process Handler] Unexpected error:", err);
        setError(err instanceof Error ? err.message : t("processing.unexpectedError"));
        setSubmitting(false);
      });
  }, [provider, id, token, requestId, organization, link, sessionId, linkFingerprint, postErrorRedirectUrl, router, t]);

  return (
    <div className="flex items-center justify-center">
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      {loading && (
        <div className="flex flex-col items-center space-y-4">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-gray-700 dark:text-gray-300">{t("processing.message")}</p>
        </div>
      )}
      {error && (
        <div className="max-w-md py-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </div>
  );
}
