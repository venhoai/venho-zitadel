import { Cloud, KeyRound, LucideIcon, Mail, RefreshCw, ScanText, UserCog, CircleUserRound } from "lucide-react";

/**
 * VENHO FORK — turn the raw OAuth scope strings on a device authorization
 * request into the rows the consent screen shows.
 *
 * Upstream renders one bullet per scope, looking up `device.scope.<scope>` and
 * falling back to an EMPTY STRING when there is no translation — so a scope with
 * no entry renders as a blank bordered row. That is the worst possible outcome
 * on a consent screen: the user is granting something, and the page shows them
 * nothing at all where its description should be.
 *
 * It matters here because venho-desktop asks for five scopes, two of which
 * upstream has never heard of:
 *
 *   openid profile email offline_access
 *   urn:zitadel:iam:org:project:id:387826979342134098:aud
 *   urn:zitadel:iam:org:project:id:zitadel:aud
 *
 * The reserved `...:aud` scopes are audience selectors — they decide which API
 * the resulting token may address — so they are not "data the app can read", but
 * they are also not nothing, and hiding them would misrepresent the grant. Both
 * get a row that says what they actually enable.
 *
 * Anything still unrecognised falls through to a row carrying the raw scope
 * string. Ugly on purpose: an unexplained permission should look unexplained,
 * not invisible.
 */

/** `urn:zitadel:iam:org:project:id:<project or "zitadel">:aud` */
const PROJECT_AUDIENCE = /^urn:zitadel:iam:org:project:id:([^:]+):aud$/;

export type ScopeRow = {
  /** React key — the raw scope, which is unique within a request. */
  scope: string;
  icon: LucideIcon;
  /**
   * Suffix under `device.scopeTitle.*` / `device.scope.*`, or null when the
   * scope is unrecognised and the raw string is shown instead.
   */
  i18nKey: string | null;
};

const KNOWN: Record<string, { icon: LucideIcon; i18nKey: string }> = {
  openid: { icon: ScanText, i18nKey: "openid" },
  profile: { icon: CircleUserRound, i18nKey: "profile" },
  email: { icon: Mail, i18nKey: "email" },
  offline_access: { icon: RefreshCw, i18nKey: "offline_access" },
};

export function toScopeRows(scopes: string[] | undefined): ScopeRow[] {
  return (scopes ?? [])
    .filter((s) => !!s)
    .map((scope) => {
      const known = KNOWN[scope];
      if (known) {
        return { scope, icon: known.icon, i18nKey: known.i18nKey };
      }

      const audience = PROJECT_AUDIENCE.exec(scope);
      if (audience) {
        // ZITADEL's own project — this is what lets the token call the account
        // API, which is how the desktop app edits a profile without a browser.
        return audience[1] === "zitadel"
          ? { scope, icon: UserCog, i18nKey: "account" }
          : { scope, icon: Cloud, i18nKey: "cloud" };
      }

      return { scope, icon: KeyRound, i18nKey: null };
    });
}
