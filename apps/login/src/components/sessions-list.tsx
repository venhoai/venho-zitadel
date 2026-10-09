"use client";

import { timestampDate } from "@zitadel/client";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { useCallback, useState } from "react";
import { Alert } from "./alert";
import { SessionItem } from "./session-item";
import { Translated } from "./translated";

type Props = {
  sessions: Session[];
  requestId?: string;
  /** Session id → the user's profile picture, where the server found one. */
  avatarUrlById?: Record<string, string>;
};

function sortByChangeDateDesc(a: Session, b: Session): number {
  const dateA = a.changeDate ? timestampDate(a.changeDate).getTime() : 0;
  const dateB = b.changeDate ? timestampDate(b.changeDate).getTime() : 0;
  return dateB - dateA;
}

/**
 * The accounts this browser holds sessions for, most recently used first.
 *
 * VENHO FORK: tiles only, as designed. The "Continue as {name}" button this
 * list used to lead with is gone — each tile carries its own chevron now, so
 * the tiles themselves read as the way forward.
 *
 * Once one tile is on its way, every tile waits: a second account clicked
 * while the first one's page loads would start a second sign-in into the same
 * auth request.
 */
export function SessionsList({ sessions, requestId, avatarUrlById }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const onBusyChange = useCallback(
    (id: string, busy: boolean) => setBusyId((current) => (busy ? id : current === id ? null : current)),
    [],
  );

  if (!sessions) {
    return (
      <Alert>
        <Translated i18nKey="noResults" namespace="accounts" />
      </Alert>
    );
  }

  const visible = sessions.filter((session) => session?.factors?.user?.loginName).sort(sortByChangeDateDesc);

  return (
    <>
      {visible.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          requestId={requestId}
          avatarUrl={avatarUrlById?.[session.id]}
          disabled={busyId !== null && busyId !== session.id}
          onBusyChange={(busy) => onBusyChange(session.id, busy)}
        />
      ))}
    </>
  );
}
