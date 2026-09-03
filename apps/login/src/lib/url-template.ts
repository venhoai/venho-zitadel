/**
 * VENHO FORK — notification URL templates and the 200-rune cap.
 *
 * Every `url_template` ZITADEL accepts on a notification request is validated as
 * `{min_len: 1, max_len: 200}` runes:
 *
 *  - `SendEmailVerificationCode`  — proto/zitadel/user/v2/email.proto
 *  - `SendInviteCode`             — proto/zitadel/user/v2/user.proto
 *  - `SendPasswordResetLink`      — proto/zitadel/user/v2/password.proto
 *  - `OTPEmail.SendCode`          — proto/zitadel/session/v2/challenge.proto
 *
 * Overrunning it is not a soft failure. The request is rejected with
 * InvalidArgument, so no code is ever generated, nothing is queued, and the
 * instance logs nothing about a mail it was never asked to send.
 *
 * The login app used to append the flow's `requestId` to every one of those
 * templates. That is harmless for an OIDC or SAML id (`oidc_V2_<18 digits>`, 26
 * runes) and fatal for a device grant: a `device_` id is the encrypted device
 * authorization request itself, a JWE of roughly 264 runes, which puts any of
 * these templates over the cap on its own. Sign-up through the device flow — the
 * path venho-desktop and Mind 2 use — therefore never sent a verification mail
 * at all, while the UI told the user to go and read one.
 *
 * So a requestId travels in a mail link only when it is not a device id and only
 * when the result still fits. What the link gives up, the session cookie already
 * holds: the pages that receive these links recover the requestId from the
 * `sessions` cookie (`sendVerification`, `/otp/[method]`, `/password/set`), so
 * the flow still completes in the browser that started it. A link opened on a
 * different device has no cookie to recover from and ends on the verified/success
 * page instead of resuming the grant — the device flow's own polling is what
 * carries that case.
 */

/** The cap ZITADEL's validators enforce on every notification `url_template`. */
export const URL_TEMPLATE_MAX_RUNES = 200;

/**
 * Length as the validator counts it: Go measures runes (unicode code points),
 * so `[...s].length`, not `s.length` (which counts UTF-16 units).
 */
export function runeLength(value: string): number {
  return Array.from(value).length;
}

/** A device authorization request id — always far too long for a mail link. */
export function isDeviceRequestId(requestId?: string): boolean {
  return !!requestId?.startsWith("device_");
}

export function exceedsUrlTemplateLimit(urlTemplate: string): boolean {
  return runeLength(urlTemplate) > URL_TEMPLATE_MAX_RUNES;
}

/**
 * Append `requestId` to a notification URL template, but only when it can
 * travel: never for a device grant, and never when doing so would breach the
 * cap and take the whole notification down with it.
 */
export function appendRequestIdToUrlTemplate(urlTemplate: string, requestId?: string): string {
  if (!requestId || isDeviceRequestId(requestId)) {
    return urlTemplate;
  }

  const separator = urlTemplate.includes("?") ? "&" : "?";
  const withRequestId = `${urlTemplate}${separator}requestId=${encodeURIComponent(requestId)}`;

  return exceedsUrlTemplateLimit(withRequestId) ? urlTemplate : withRequestId;
}
