"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { continueWithSession, ContinueWithSessionCommand } from "@/lib/server/session";
import { timestampDate } from "@zitadel/client";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Button, ButtonVariants } from "./button";
import { SessionItem } from "./session-item";
import { Spinner } from "./spinner";
import { Translated } from "./translated";

type Props = {
  sessions: Session[];
  requestId?: string;
  /**
   * Per-session id → server-computed validity (`isSessionValid`: primary factor
   * + expiry + MFA + email verification). Drives the status dot and picks the
   * account the explicit Continue button acts on. Absent → the tiles fall back
   * to the client-only estimate and no Continue button is shown.
   */
  validityById?: Record<string, boolean>;
};

function sortByChangeDateDesc(a: Session, b: Session): number {
  const dateA = a.changeDate ? timestampDate(a.changeDate).getTime() : 0;
  const dateB = b.changeDate ? timestampDate(b.changeDate).getTime() : 0;
  return dateB - dateA;
}

/**
 * VENHO FORK: the picker's explicit forward action.
 *
 * Upstream's account chooser has no Continue button at all — the only way on is
 * to know that the account tiles are themselves clickable. That reads as "a list
 * of accounts and no way to proceed", which is exactly the reported confusion.
 * When a session is actually valid we surface a primary "Continue as {name}" so
 * the default path is a button, not a discovered affordance. The tiles remain,
 * for switching to a different account.
 */
function ContinueAsButton({ session, requestId }: { session: Session; requestId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  const name = session.factors?.user?.displayName || session.factors?.user?.loginName || "";

  return (
    <div className="flex w-full flex-col gap-[12px]">
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <Button
        data-testid="continue-as-button"
        variant={ButtonVariants.Primary}
        className="h-[40px] w-full justify-center"
        disabled={loading}
        onClick={async () => {
          if (!session.factors?.user) {
            return;
          }
          setLoading(true);
          try {
            const payload: ContinueWithSessionCommand = session;
            if (requestId) {
              payload.requestId = requestId;
            }
            const res = await continueWithSession(payload);
            handleServerActionResponse(res, router, setSamlData, (e) => setError(e));
          } catch {
            setError("An internal error occurred");
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading && <Spinner className="mr-2 h-5 w-5" />}
        <Translated i18nKey="continueAs" namespace="accounts" data={{ name }} />
      </Button>

      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function SessionsList({ sessions, requestId, validityById }: Props) {
  const [list, setList] = useState<Session[]>(sessions);

  if (!sessions) {
    return (
      <Alert>
        <Translated i18nKey="noResults" namespace="accounts" />
      </Alert>
    );
  }

  const visible = list.filter((session) => session?.factors?.user?.loginName).sort(sortByChangeDateDesc);

  // The account the explicit Continue button acts on: the most recently used
  // session the server considers valid. Undefined when nothing is valid, in
  // which case the tiles (each of which re-authenticates on click) are the only
  // path forward — as before.
  const primaryValid = validityById ? visible.find((s) => validityById[s.id]) : undefined;

  return (
    <div className="flex flex-col space-y-2">
      {primaryValid && <ContinueAsButton session={primaryValid} requestId={requestId} />}

      {visible.map((session, index) => {
        return (
          <SessionItem
            session={session}
            requestId={requestId}
            serverValid={validityById ? !!validityById[session.id] : undefined}
            reload={() => {
              setList(list.filter((s) => s.id !== session.id));
            }}
            key={"session-" + index}
          />
        );
      })}
    </div>
  );
}
