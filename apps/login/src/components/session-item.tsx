"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { continueWithSession, ContinueWithSessionCommand } from "@/lib/server/session";
import { Timestamp, timestampDate } from "@zitadel/client";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { getInitials } from "./avatar";
import { Spinner } from "./spinner";
import { ACCOUNT_TILE_CLASSES, AccountTileChevron } from "./venho/account-tile";

export function isSessionPrimaryFactorAndLifetimeValid(session: Partial<Session>): {
  valid: boolean;
  verifiedAt?: Timestamp;
} {
  const validPassword = session?.factors?.password?.verifiedAt;
  const validPasskey = session?.factors?.webAuthN?.verifiedAt;
  const validIDP = session?.factors?.intent?.verifiedAt;

  const stillValid = session.expirationDate ? timestampDate(session.expirationDate) > new Date() : true;

  const verifiedAt = validPassword || validPasskey || validIDP;
  const valid = !!((validPassword || validPasskey || validIDP) && stillValid);

  return { valid, verifiedAt };
}

/**
 * One account this browser holds a session for.
 *
 * VENHO FORK: as designed — avatar, name, login name, chevron — and nothing
 * else. Upstream's validity dot, "verified … ago" line, hover-to-remove and
 * expiry tooltip are gone. A click always goes through `continueWithSession`,
 * which re-checks the session on the server and, when it can no longer
 * complete the flow, re-authenticates (password, MFA, verify, or the login
 * name screen) — so a tile always moves forward, whatever state it is in.
 */
export function SessionItem({
  session,
  requestId,
  avatarUrl,
}: {
  session: Session;
  requestId?: string;
  /** The user's profile picture, when the server could look it up. */
  avatarUrl?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  const user = session.factors?.user;
  const loginName = user?.loginName ?? "";
  const displayName = user?.displayName ?? "";

  async function continueAs() {
    if (!user) {
      return;
    }
    setError(null);
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
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <button
        type="button"
        onClick={continueAs}
        disabled={loading}
        data-testid="account-tile"
        className={ACCOUNT_TILE_CLASSES}
      >
        <AccountAvatar name={displayName} loginName={loginName} imageUrl={avatarUrl} />

        {displayName ? (
          <span className="flex min-w-0 flex-1 flex-col text-sm leading-5">
            <span className="text-text-light-500 dark:text-text-dark-500 truncate">{displayName}</span>
            <span className="text-venho-light-muted dark:text-venho-dark-muted truncate">{loginName}</span>
          </span>
        ) : (
          // No display name: the login name alone, one size up, as designed.
          <span className="text-text-light-500 dark:text-text-dark-500 min-w-0 flex-1 truncate text-base leading-6">
            {loginName}
          </span>
        )}

        {loading ? <Spinner className="size-4 shrink-0" /> : <AccountTileChevron />}
      </button>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

/**
 * 40px round avatar: the profile picture, or initials on the muted wash.
 * Not the shared `<Avatar>`, whose hashed colours are not in these designs.
 */
function AccountAvatar({ name, loginName, imageUrl }: { name: string; loginName: string; imageUrl?: string }) {
  return (
    <span
      aria-hidden
      className="border-venho-light-border dark:border-venho-dark-border bg-venho-light-wash dark:bg-venho-dark-wash text-text-light-500 dark:text-text-dark-500 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-sm leading-5 uppercase"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        getInitials(name || loginName, loginName)
      )}
    </span>
  );
}
