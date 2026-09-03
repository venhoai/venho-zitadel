"use server";

import { createLogger } from "@/lib/logger";
import { appendRequestIdToUrlTemplate, exceedsUrlTemplateLimit, runeLength } from "@/lib/url-template";
import {
  createInviteCode,
  getLoginSettings,
  getSession,
  getUserByID,
  listAuthenticationMethodTypes,
  verifyEmail,
  verifyInviteCode,
  verifyTOTPRegistration,
  sendEmailCode as zitadelSendEmailCode,
} from "@/lib/zitadel";
import crypto from "crypto";

import { create } from "@zitadel/client";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { getTranslations } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { completeFlowOrGetUrl } from "../client";
import { getSessionCookieByLoginName } from "../cookies";
import { getOrSetFingerprintId } from "../fingerprint";
import { checkMFAFactors } from "../mfa-helper";
import { getServiceConfig } from "../service-url";
import { loadMostRecentSession } from "../session";
import { createSessionAndUpdateCookie } from "./cookie";
import { getEnrollmentAuthorizationError } from "./enrollment-guard";
import { getPublicHostWithProtocol } from "./host";

const logger = createLogger("verify");

export async function verifyTOTP(code: string, loginName?: string, organization?: string) {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  return loadMostRecentSession({
    serviceConfig,
    sessionParams: {
      loginName,
      organization,
    },
  }).then(async (session) => {
    if (session?.factors?.user?.id) {
      // Enrollment must be authorized: a bare identify-only session must not be able to
      // activate a TOTP factor on the account (GHSA-45f2-5q3r-xgg6).
      const enrollmentError = await getEnrollmentAuthorizationError({
        serviceConfig,
        session,
        userId: session.factors.user.id,
      });
      if (enrollmentError) {
        return { error: enrollmentError };
      }

      return verifyTOTPRegistration({ serviceConfig, code, userId: session.factors.user.id });
    } else {
      throw Error("No user id found in session.");
    }
  });
}

type VerifyUserByEmailCommand = {
  userId: string;
  loginName?: string; // to determine already existing session
  organization?: string;
  code: string;
  isInvite: boolean;
  requestId?: string;
};

export async function sendVerification(command: VerifyUserByEmailCommand) {
  const t = await getTranslations("verify");
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const verifyResponse = command.isInvite
    ? await verifyInviteCode({ serviceConfig, userId: command.userId, verificationCode: command.code }).catch((error) => {
        logger.warn("Could not verify invite:", { error });
        return { error: t("errors.couldNotVerifyInvite") };
      })
    : await verifyEmail({ serviceConfig, userId: command.userId, verificationCode: command.code }).catch((error) => {
        logger.warn("Could not verify email:", { error });
        return { error: t("errors.couldNotVerifyEmail") };
      });

  if ("error" in verifyResponse) {
    return verifyResponse;
  }

  if (!verifyResponse) {
    return { error: t("errors.couldNotVerify") };
  }

  let session: Session | undefined;
  const userResponse = await getUserByID({ serviceConfig, userId: command.userId });

  if (!userResponse || !userResponse.user) {
    return { error: t("errors.couldNotLoadUser") };
  }

  const user = userResponse.user;

  const sessionCookie = await getSessionCookieByLoginName({
    loginName: command.loginName ?? user.preferredLoginName,
    organization: command.organization,
  });

  // VENHO FORK: a device_ requestId cannot travel in the verification mail — it
  // is a ~264-rune JWE and ZITADEL caps every notification url_template at 200
  // (see lib/url-template.ts), so the link the user clicks carries no requestId
  // at all. The session cookie kept it from the moment the session was created,
  // and this is the same browser, so recover it here. Without it the device
  // grant is stranded: the flow would finish on /signedin with nothing left to
  // complete. An explicit requestId on the request always wins.
  const requestId = command.requestId ?? sessionCookie?.requestId;

  if (sessionCookie) {
    session = await getSession({ serviceConfig, sessionId: sessionCookie.id, sessionToken: sessionCookie.token })
      .then((response) => {
        if (response?.session) {
          return response.session;
        }
      })
      .catch((error) => {
        // user session is not found, so we create a new one
        logger.warn("[verify] user session is not found, so we create a new one", { error });
        return undefined;
      });
  }

  // load auth methods for user
  const authMethodResponse = await listAuthenticationMethodTypes({ serviceConfig, userId: user.userId });

  if (!authMethodResponse || !authMethodResponse.authMethodTypes) {
    return { error: t("errors.couldNotLoadAuthenticators") };
  }

  const hasPrimaryMethod =
    authMethodResponse?.authMethodTypes?.some(
      (m: AuthenticationMethodType) =>
        m === AuthenticationMethodType.PASSWORD ||
        m === AuthenticationMethodType.PASSKEY ||
        m === AuthenticationMethodType.IDP,
    ) ?? false;

  // if no primary auth methods are found on the user, redirect to set one up
  if (!hasPrimaryMethod) {
    if (!session) {
      const checks = create(ChecksSchema, {
        user: {
          search: {
            case: "loginName",
            value: userResponse.user.preferredLoginName,
          },
        },
      });

      const result = await createSessionAndUpdateCookie({
        checks,
        requestId: requestId,
      });
      session = result.session;
    }

    if (!session) {
      return { error: t("errors.couldNotCreateSession") };
    }

    const params = new URLSearchParams({
      sessionId: session.id,
    });

    if (session.factors?.user?.loginName) {
      params.set("loginName", session.factors?.user?.loginName);
    }

    if (requestId) {
      params.set("requestId", requestId);
    }

    // set hash of userId and userAgentId to prevent attacks, checks are done for users with invalid sessions and invalid userAgentId
    const cookiesList = await cookies();
    const userAgentId = await getOrSetFingerprintId();

    const verificationCheck = crypto.createHash("sha256").update(`${user.userId}:${userAgentId}`).digest("hex");

    await cookiesList.set({
      name: "verificationCheck",
      value: verificationCheck,
      httpOnly: true,
      path: "/",
      maxAge: 300, // 5 minutes
    });

    return { redirect: `/authenticator/set?${params}` };
  }

  // if no session found only show success page,
  // if user is invited, recreate invite flow to not depend on session
  if (!session?.factors?.user?.id) {
    const verifySuccessParams = new URLSearchParams({});

    if (command.userId) {
      verifySuccessParams.set("userId", command.userId);
    }

    if (("loginName" in command && command.loginName) || user.preferredLoginName) {
      verifySuccessParams.set(
        "loginName",
        "loginName" in command && command.loginName ? command.loginName : user.preferredLoginName,
      );
    }
    if (requestId) {
      verifySuccessParams.set("requestId", requestId);
    }
    if (command.organization) {
      verifySuccessParams.set("organization", command.organization);
    }

    return { redirect: `/verify/success?${verifySuccessParams}` };
  }

  const loginSettings = await getLoginSettings({ serviceConfig, organization: user.details?.resourceOwner });

  // redirect to mfa factor if user has one, or redirect to set one up
  const mfaFactorCheck = await checkMFAFactors(
    serviceConfig,
    session,
    loginSettings,
    authMethodResponse.authMethodTypes,
    command.organization,
    requestId,
  );

  if (mfaFactorCheck?.redirect) {
    return mfaFactorCheck;
  }

  // login user if no additional steps are required
  if (requestId && session.id) {
    return completeFlowOrGetUrl(
      {
        sessionId: session.id,
        requestId: requestId,
        organization: command.organization ?? session.factors?.user?.organizationId,
      },
      loginSettings?.defaultRedirectUri,
    );
  }

  // Regular flow - return URL for client-side navigation
  return completeFlowOrGetUrl(
    {
      loginName: session.factors.user.loginName,
      organization: session.factors?.user?.organizationId,
    },
    loginSettings?.defaultRedirectUri,
  );
}

function buildVerificationUrlTemplate(
  hostWithProtocol: string,
  basePath: string,
  isInvite: boolean,
  requestId?: string,
): string {
  let urlTemplate = `${hostWithProtocol}${basePath}/verify?code={{.Code}}&userId={{.UserID}}&organization={{.OrgID}}`;

  if (isInvite) {
    urlTemplate += "&invite=true";
  }

  // VENHO FORK: the requestId travels only when it fits ZITADEL's 200-rune cap,
  // and never for a device grant, which would breach it single-handedly and take
  // the whole notification down with it. sendVerification recovers it from the
  // session cookie at the other end.
  const withRequestId = appendRequestIdToUrlTemplate(urlTemplate, requestId);

  if (exceedsUrlTemplateLimit(withRequestId)) {
    // Nothing left to drop: the host and base path breach the cap on their own,
    // so SendEmailCode will reject this with InvalidArgument. Say so here — the
    // instance never receives the request and logs nothing about it.
    logger.error("Verification URL template exceeds ZITADEL's 200 rune limit; no mail can be sent", {
      length: runeLength(withRequestId),
      urlTemplate: withRequestId,
    });
  }

  return withRequestId;
}

type resendVerifyEmailCommand = {
  userId: string;
  isInvite: boolean;
  requestId?: string;
};

export async function resendVerification(command: resendVerifyEmailCommand) {
  const t = await getTranslations("verify");
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const hostWithProtocol = await getPublicHostWithProtocol(_headers);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const urlTemplate = buildVerificationUrlTemplate(hostWithProtocol, basePath, command.isInvite, command.requestId);

  return command.isInvite
    ? createInviteCode({
        serviceConfig,
        userId: command.userId,
        urlTemplate,
      }).catch((error) => {
        if (error.code === 9) {
          return { error: t("errors.userAlreadyVerified") };
        }
        logger.error("Could not resend invite code", { userId: command.userId, error });
        return { error: t("errors.couldNotResendInvite") };
      })
    : zitadelSendEmailCode({
        serviceConfig,
        userId: command.userId,
        urlTemplate,
      }).catch((error) => {
        // VENHO FORK: this used to reject, and the form turned every rejection
        // into a bare "Could not resend email" — no way to tell a network blip
        // from an instance that cannot send at all. Return the failure so the
        // page can state it, and log the reason the instance gave.
        logger.error("Could not resend verification email", { userId: command.userId, error });
        return { error: t("errors.emailSendFailed") };
      });
}

type SendEmailCommand = {
  userId: string;
  urlTemplate: string;
};

export async function sendEmailCode(command: SendEmailCommand) {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  return zitadelSendEmailCode({ serviceConfig, userId: command.userId, urlTemplate: command.urlTemplate });
}

export async function sendInviteEmailCode(command: SendEmailCommand) {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  return createInviteCode({ serviceConfig, userId: command.userId, urlTemplate: command.urlTemplate });
}

type TrySendVerificationCommand = {
  userId: string;
  isInvite: boolean;
  requestId?: string;
};

/**
 * Attempts to send an initial verification email/invite code.
 * Returns `true` if sent successfully, `false` on error (swallowed and logged).
 */
export async function trySendVerification(command: TrySendVerificationCommand): Promise<boolean> {
  // Hoisted so the failure log below can name the template that was rejected.
  let urlTemplate: string | undefined;

  try {
    const _headers = await headers();
    const { serviceConfig } = getServiceConfig(_headers);
    const hostWithProtocol = await getPublicHostWithProtocol(_headers);

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    urlTemplate = buildVerificationUrlTemplate(hostWithProtocol, basePath, command.isInvite, command.requestId);

    if (command.isInvite) {
      await createInviteCode({
        serviceConfig,
        userId: command.userId,
        urlTemplate,
      });
    } else {
      await zitadelSendEmailCode({
        serviceConfig,
        userId: command.userId,
        urlTemplate,
      });
    }

    logger.info("Verification email sent successfully", { userId: command.userId, isInvite: command.isInvite });
    return true;
  } catch (err) {
    logger.error("Failed to send verification email", {
      userId: command.userId,
      isInvite: command.isInvite,
      requestId: command.requestId,
      urlTemplate,
      urlTemplateLength: urlTemplate ? runeLength(urlTemplate) : undefined,
      error: err,
    });
    return false;
  }
}
