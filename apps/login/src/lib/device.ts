import { cookies } from "next/headers";
import { createLogger } from "./logger";

/**
 * VENHO FORK — the browser's own record of the device authorizations it started.
 *
 * The device grant has a problem no other flow has: the only server-side lookup
 * for a pending request is **by user code**
 * (`GetDeviceAuthorizationRequest`, internal/api/grpc/oidc/v2/oidc.go), while
 * everything downstream of `/device` — sign-in, sign-up, MFA, email
 * verification — carries only a `requestId`. Worse, the `requestId` is not a
 * stable name for the request: it is `EncryptToken(deviceCode)`, freshly
 * encrypted on every call, so two lookups of the same user code return two
 * different ids and comparing them proves nothing.
 *
 * So the browser remembers the pairing itself, in an httpOnly cookie written at
 * `/device` when the user submits the code. That cookie is what makes consent
 * meaningful:
 *
 *  - **It binds the grant to this browser.** Approval resolves the device
 *    request from the *cookie's* user code, never from the URL. A `requestId`
 *    someone else minted and mailed to a signed-in victim is not in that
 *    victim's cookie, so it cannot be approved by loading a link.
 *  - **It survives the detour through sign-up.** The user code is entered
 *    before the account exists; the approval needs it several screens later.
 *
 * Entries are small and short-lived. The cap exists because the store is a
 * cookie and `requestId` is a JWE of roughly 264 characters: three concurrent
 * device authorizations in one browser is already beyond what anyone does, and
 * the oldest is dropped rather than letting the header grow without bound.
 */

const logger = createLogger("device");

export const DEVICE_COOKIE_NAME = "deviceAuthorizations";

/**
 * How long the browser keeps the pairing. Deliberately longer than the
 * instance's device-code lifetime (`ZITADEL_OIDC_DEVICEAUTH_LIFETIME`, 5
 * minutes by default), because the cookie outliving the request produces a
 * clear "this request expired, start again on your device" message, while the
 * request outliving the cookie produces a confusing "unknown request" one.
 */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 30 * 60;

const MAX_PENDING = 3;

export type PendingDeviceAuthorization = {
  /** The `device_<id>` value the login flow carries as its requestId. */
  requestId: string;
  /** The user code the request is actually looked up by. */
  userCode: string;
  /** Epoch milliseconds, used to evict the oldest entry and expired ones. */
  ts: number;
};

function parse(value: string | undefined): PendingDeviceAuthorization[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is PendingDeviceAuthorization =>
        !!entry && typeof entry.requestId === "string" && typeof entry.userCode === "string",
    );
  } catch (error) {
    // A malformed cookie must not break the flow: the user re-enters the code.
    logger.warn("could not parse the device authorization cookie", { error });
    return [];
  }
}

function unexpired(entries: PendingDeviceAuthorization[]): PendingDeviceAuthorization[] {
  const oldest = Date.now() - DEVICE_COOKIE_MAX_AGE_SECONDS * 1000;
  return entries.filter((entry) => typeof entry.ts === "number" && entry.ts > oldest);
}

async function readAll(): Promise<PendingDeviceAuthorization[]> {
  const cookiesList = await cookies();
  return unexpired(parse(cookiesList.get(DEVICE_COOKIE_NAME)?.value));
}

async function writeAll(entries: PendingDeviceAuthorization[]) {
  const cookiesList = await cookies();

  if (!entries.length) {
    cookiesList.delete(DEVICE_COOKIE_NAME);
    return;
  }

  cookiesList.set({
    name: DEVICE_COOKIE_NAME,
    value: JSON.stringify(entries),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Record that this browser submitted `userCode` and was given `requestId`.
 * Only callable where cookies can be written — a server action or a route
 * handler, not a page render.
 */
export async function rememberDeviceAuthorization({ requestId, userCode }: { requestId: string; userCode: string }) {
  const existing = (await readAll()).filter((entry) => entry.requestId !== requestId && entry.userCode !== userCode);

  // Newest first, so the cap drops the stalest pairing.
  const entries = [{ requestId, userCode, ts: Date.now() }, ...existing].slice(0, MAX_PENDING);

  await writeAll(entries);
}

/**
 * The user code this browser paired with `requestId`, or undefined when it
 * never did — which is the check that stops a device authorization someone else
 * started from being approved here.
 */
export async function getPendingDeviceAuthorization(requestId?: string): Promise<PendingDeviceAuthorization | undefined> {
  if (!requestId) {
    return undefined;
  }

  return (await readAll()).find((entry) => entry.requestId === requestId);
}

/** Drop one pairing once its grant has been approved or denied. */
export async function forgetDeviceAuthorization(requestId: string) {
  const remaining = (await readAll()).filter((entry) => entry.requestId !== requestId);
  await writeAll(remaining);
}
