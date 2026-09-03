"use server";

import { getAllSessions, getSessionCookieById } from "@/lib/cookies";
import { forgetDeviceAuthorization, getPendingDeviceAuthorization, rememberDeviceAuthorization } from "@/lib/device";
import { createLogger } from "@/lib/logger";
import { isSessionValid } from "@/lib/session";
import { authorizeOrDenyDeviceAuthorization, getDeviceAuthorizationRequest, getSession } from "@/lib/zitadel";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { getServiceConfig } from "../service-url";

/**
 * VENHO FORK — the device grant's three server actions, and the order they
 * enforce.
 *
 * Upstream's Login V2 shows the consent screen *before* anyone has identified
 * themselves, and Allow is a plain link: nothing records the decision, and the
 * grant is really approved later, by a GET on `/signedin`, against whichever
 * session cookie happens to match. That is backwards twice over. The user
 * approves scopes for an account they have not chosen yet, and a link is enough
 * to bind a device to a signed-in victim who never clicked anything.
 *
 * ZITADEL's own legacy login gets this right — `handleDeviceAuthAction`
 * (internal/api/ui/login/device_auth.go) refuses to render approve/deny until
 * `authReq.Done()` — so this is the v1 ordering restored for v2:
 *
 *   /device (code) → account choice / sign-in / sign-up → consent → approve
 *
 * Approval is a POST server action that needs three things at once: the
 * `requestId` in this browser's device cookie (see lib/device.ts), a session
 * cookie the browser holds, and that session passing the same `isSessionValid`
 * gate the rest of the flow uses. A link can supply none of them.
 */

const logger = createLogger("device");

export type DeviceActionResponse = { redirect: string } | { error: string };

/**
 * Step one: the user typed the code shown on their device.
 *
 * Resolves the request so a wrong code fails here rather than after a sign-in,
 * pairs it with this browser, and answers with where identity gets established
 * — the account picker when there are sessions to choose from, the login name
 * screen when there are none. Consent comes after that, not before.
 */
export async function startDeviceAuthorization(userCode: string): Promise<{ redirect: string } | { error: string }> {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const t = await getTranslations("error");

  let requestId: string;
  try {
    const { deviceAuthorizationRequest } = await getDeviceAuthorizationRequest({ serviceConfig, userCode });

    if (!deviceAuthorizationRequest?.id) {
      return { error: t("noDeviceRequest") };
    }

    requestId = `device_${deviceAuthorizationRequest.id}`;
  } catch (error) {
    logger.warn("could not resolve the device authorization request", { error });
    return { error: t("noDeviceRequest") };
  }

  await rememberDeviceAuthorization({ requestId, userCode });

  const params = new URLSearchParams({ requestId });
  const sessions = await getAllSessions();

  return { redirect: (sessions.length ? "/accounts?" : "/loginname?") + params };
}

async function loadValidSession(sessionId: string, organization?: string) {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const cookie = await getSessionCookieById({ sessionId, organization });

  if (!cookie) {
    return undefined;
  }

  const { session } = await getSession({ serviceConfig, sessionId: cookie.id, sessionToken: cookie.token });

  if (!session || !(await isSessionValid({ serviceConfig, session }))) {
    return undefined;
  }

  return { cookie, session };
}

/**
 * Step two: the user, now signed in, allowed the grant.
 *
 * The device request is resolved from the user code in this browser's cookie,
 * never from the `requestId` in the URL — an id is not proof of anything, since
 * it is minted fresh on every lookup and travels in plain sight.
 */
export async function approveDeviceAuthorization({
  requestId,
  sessionId,
  organization,
}: {
  requestId: string;
  sessionId: string;
  organization?: string;
}): Promise<DeviceActionResponse> {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const t = await getTranslations("error");

  const pending = await getPendingDeviceAuthorization(requestId);

  if (!pending) {
    logger.warn("approve rejected: this browser did not start that device authorization", { requestId });
    return { error: t("deviceRequestUnknown") };
  }

  const valid = await loadValidSession(sessionId, organization);

  if (!valid) {
    // The session died between rendering consent and clicking Allow (expired,
    // logged out elsewhere, or an MFA policy that now applies). Send the user
    // back to authenticate; the grant is still pending and consent runs again.
    const params = new URLSearchParams({ requestId });
    if (organization) {
      params.append("organization", organization);
    }
    return { redirect: "/loginname?" + params };
  }

  try {
    const { deviceAuthorizationRequest } = await getDeviceAuthorizationRequest({
      serviceConfig,
      userCode: pending.userCode,
    });

    if (!deviceAuthorizationRequest?.id) {
      return { error: t("deviceRequestExpired") };
    }

    await authorizeOrDenyDeviceAuthorization({
      serviceConfig,
      deviceAuthorizationId: deviceAuthorizationRequest.id,
      session: { sessionId: valid.cookie.id, sessionToken: valid.cookie.token },
    });
  } catch (error) {
    // Errors.DeviceAuth.NotFound / AlreadyHandled / an expired code all land
    // here, and all mean the same thing to the user: this request is over.
    logger.warn("could not approve the device authorization", { error });
    return { error: t("deviceRequestExpired") };
  }

  await forgetDeviceAuthorization(requestId);

  const params = new URLSearchParams({ requestId, sessionId: valid.cookie.id });

  return { redirect: "/signedin?" + params };
}

/**
 * Step two, the other answer. Cancelling needs the browser's own pairing but
 * deliberately not a live session: a user who decides they did not start this
 * request should be able to shut it down even if their sign-in has since gone
 * stale, and denying is not an action anyone needs protecting from.
 */
export async function denyDeviceAuthorization({ requestId }: { requestId: string }): Promise<DeviceActionResponse> {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const t = await getTranslations("error");

  const pending = await getPendingDeviceAuthorization(requestId);

  if (!pending) {
    logger.warn("deny rejected: this browser did not start that device authorization", { requestId });
    return { error: t("deviceRequestUnknown") };
  }

  try {
    const { deviceAuthorizationRequest } = await getDeviceAuthorizationRequest({
      serviceConfig,
      userCode: pending.userCode,
    });

    if (deviceAuthorizationRequest?.id) {
      await authorizeOrDenyDeviceAuthorization({
        serviceConfig,
        deviceAuthorizationId: deviceAuthorizationRequest.id,
      });
    }
  } catch (error) {
    // An expired or already-handled request is not an error worth showing on
    // the way out: the outcome the user asked for is the outcome they get.
    logger.warn("could not deny the device authorization", { error });
  }

  await forgetDeviceAuthorization(requestId);

  return { redirect: "/signedin?" + new URLSearchParams({ requestId, result: "denied" }) };
}
