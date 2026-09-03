# venhoai/zitadel — Venho login fork

Venho's fork of [zitadel/zitadel](https://github.com/zitadel/zitadel) — pushed to
[venhoai/zitadel](https://github.com/venhoai/zitadel) — carrying a
rebranded **Login V2** app (`apps/login`).

Everything outside `apps/login` is upstream and should stay that way — the fork
is whole-repo because the login app depends on the `@zitadel/client` and
`@zitadel/proto` workspace packages, which must stay on the same revision as the
app that consumes them. Forking only `apps/login` breaks proto codegen.

| | |
|---|---|
| Fork point | `v4.17.1` (2026-08-14) |
| Branch | `venho/main` |
| Upstream remote | `upstream` → `https://github.com/zitadel/zitadel.git` |
| Deployed at | `https://auth.dev.venho.ai/ui/v2/login` |

## Why this exists

Venho signs users in with the OAuth device grant (RFC 8628). venho-desktop opens
the issuer's `verification_uri_complete` in the system browser; Mind 2's Sailfish
settings page renders the same URI as a QR code. Both land the user on ZITADEL's
stock login — the one unbranded surface in an otherwise designed product, and on
the device pages a nearly empty one.

Neither client hardcodes a login URL: they follow whatever verification URI the
issuer returns. So pointing the instance at this app rebrands both **without a
client release**.

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm nx run-many --target generate     # proto codegen — required before build
cp apps/login/.env.example apps/login/.env.local       # then fill in the PAT
pnpm --filter @zitadel/login dev
```

The PAT belongs to a machine user with the **Instance Login Client**
(`IAM_LOGIN_CLIENT`) role. Nothing runs without one.

Note the filename: `.env.local`, not the `.env.dev.local` upstream's docs
mention. Next does not load that name, so the app silently falls back to `.env`
and every API call fails with `fetch() returned undefined`.

For a disposable local instance to develop against — no dev-instance credentials
needed — see [`deploy/venho/README.md`](deploy/venho/README.md).

## What we changed, and why

Kept deliberately small and legible, so upstream merges stay cheap. Every
deviation is marked `VENHO FORK` in a comment at the site.

### Theme

ZITADEL derives a 50–900 scale into `--theme-{light,dark}-{background,primary,text,warn,link}-*`
from the **instance's branding settings**, and `tailwind.config.mjs` maps those
onto Tailwind colours. We kept that pipeline rather than replacing it with a
static token file: it means pages we have not redesigned are still on-brand, and
a colour tweak needs no redeploy.

- `apps/login/src/helpers/colors.ts` — the eight `PRIMARY` / `BACKGROUND` /
  `TEXT` / `WARN` constants now hold Venho values instead of ZITADEL's. These are
  *fallbacks*: the console's branding settings are the source of truth and carry
  the same values. Keeping both in step means a failed settings fetch degrades to
  Venho colours rather than ZITADEL blue mid-sign-in.
- `apps/login/src/components/theme-provider.tsx` — `forcedTheme="dark"`
  (upstream: switchable, defaulting to `system`). Every designed screen is dark,
  as is the app being signed into, so dark is the *only* theme here rather than a
  default. `forcedTheme` short-circuits next-themes' pre-paint script, so neither
  the visitor's OS preference nor a stored value is ever read. The storage key is
  `venho-theme`, not upstream's `cp-theme`: nothing writes to it any more, and a
  stale `cp-theme` would otherwise still surface in `resolvedTheme` — which
  `forcedTheme` does **not** override — and hand `<Avatar>` the light palette on
  a dark page.
- `apps/login/src/components/theme-wrapper.tsx` — the branding `themeMode` block
  is gone. Branding *colours* are still applied; the instance can restyle the
  login screens, it just cannot un-dark them.
- `apps/login/src/app/(login)/layout.tsx` — `<html>` carries `dark` and
  `color-scheme: dark` server-side too, so the class is in the first byte of
  HTML: no light flash before hydration, and still dark with JS off.
- `apps/login/src/app/global-error.tsx` — replaces the root layout entirely, so
  it gets neither the provider nor the class; it sets both itself, with literal
  hex rather than `var(--theme-*)` (those variables do not exist until
  `ThemeWrapper` runs).
- `apps/login/src/styles/globals.scss` — a static `#0c111d` on `html`, for the
  same reason: every themed colour is `var(--theme-*)`, written by JS on mount.
- `apps/login/src/components/theme-switch.tsx` — returns `null`. Our layout does
  not render it; the guard is for the case where a merge puts it back.

#### Why this is in code and not in the console

It was in the console, and that was the bug. The app followed the instance's
branding `themeMode`; the **local** instance was seeded `THEME_MODE_DARK` and the
**dev** instance carries `THEME_MODE_AUTO`, which upstream maps to `"system"`.
So every visitor on a light OS got a white login page while local testing looked
perfect — a difference no amount of testing against localhost could show. The
app's own appearance must not hinge on a console field that nothing in this repo
sets.

To hand the choice back to an instance, restore the `themeMode` block in
`ThemeWrapper` *and* drop `forcedTheme` from `ThemeProvider` — both, or the two
disagree and the class flickers.

`apps/login/src/components/theme-provider.test.tsx` is the net under all of
this — it runs in `pnpm test-unit`, uses the real next-themes rather than a mock
(what is being asserted *is* next-themes' behaviour under our props), and covers
a light OS preference, a stale `cp-theme`, and every `themeMode` an instance can
send, `THEME_MODE_LIGHT` included. Verified against a browser as well: dark under
a light OS preference, with JS disabled, and from the standalone production
build, with the instance pinned to `THEME_MODE_LIGHT`.
- `apps/login/.env` — the structural knobs (`NEXT_PUBLIC_THEME_*`) are pinned to
  the designed values instead of relying on `DEFAULT_THEME`.

The colour values are the desktop app's shipped tokens
(`venho-desktop/source/lib/platform/ui/venho-desktop-react/src/styles.css`),
which the Figma login designs draw from as well — so the two surfaces cannot
drift. The mapping is written out in the comment block in `colors.ts`.

### Typography

The designs use two families: **Geist** for UI text and controls, **Manrope** for
headings (the desktop app's face). Upstream used Lato.

- `apps/login/src/app/(login)/layout.tsx` — both pulled through `next/font`, so
  they are self-hosted at build time. A login page must not make a request to
  `fonts.gstatic.com` on the user's behalf.
- `apps/login/tailwind.config.mjs` — `font-sans` (Geist) and `font-display`
  (Manrope).
- `apps/login/src/styles/globals.scss` — headings take `font-display`.

### Email verification is mandatory on every sign-up path

Every sign-up path proves the user owns the address before the account is usable.
A passkey or a TOTP factor is an **additional** factor — it sits on top of email
verification, never in place of it.

It was not happening at all, for three independent reasons that each had to be
fixed:

1. **The check was behind a switch that was off.** `checkEmailVerification` was
   gated on `EMAIL_VERIFICATION === "true"`. Upstream defaults it off, our `.env`
   set it to `false`, and the deployed container never set it at all — the build
   script deletes `apps/login/.env` from the standalone output, so the variable
   does not even exist at runtime. The variable is now **removed**, not pinned to
   `true`: the code no longer reads it, and a knob that does nothing is worse than
   no knob (`apps/login/src/lib/verify-helper.ts`).
2. **The passkey path never called it.** `registerUser` branched on
   `command.password`, and the no-password branch minted a `verificationCheck`
   cookie on the spot and redirected to `/passkey/set`. That cookie *is* the
   "this user was verified recently" proof the enrolment pages read, so choosing
   "Passkey" on the sign-up screen skipped verification entirely. The gate now
   runs **before** the branch, so there is no path around it
   (`apps/login/src/lib/server/register.ts`).
3. **The external-IdP path had it commented out.** Upstream ships
   `registerUserAndLinkToIDP` with the block commented; since `addHumanUser`
   creates every user with `isVerified: false` — IdP users included — that
   produced accounts whose address nobody had confirmed. Live again.

`isSessionValid` (`apps/login/src/lib/session.ts`) lost the same env gate, which
is what closes the loop: registration creates the session *before* the email is
verified, so a user who abandons `/verify` is left holding a live session. If
that session validated, the gate on the way in would be worth nothing. Costs one
`getUserByID` per session validation.

**Operational prerequisite: the instance needs working SMTP.** Verification is no
longer optional, so an instance that cannot send mail cannot complete a sign-up —
users reach `/verify` and stop. SMTP provider config lives in the **database**;
`ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_*` only applies when an instance is
first created, so it does nothing for a database that already exists. The failure
is silent from the app's side: `SendEmailCode` returns 200 and the notification
handler dies asynchronously with `could not create email channel … SMTPConfig.NotFound`.

The local stack ships a [Mailpit](https://mailpit.axllent.org/) catcher
(`deploy/venho/compose.dev.yml`, UI on :8025); point the instance at it, or at a
real relay, with `deploy/venho/seed-smtp.sh` — see
[`deploy/venho/README.md`](deploy/venho/README.md). Run it against **every**
instance the login app fronts, and confirm with:

```sh
curl -sS -X POST "$ZITADEL_API_URL/admin/v1/email/_search" \
  -H "Authorization: Bearer $PAT" -d '{}'   # must list a provider, state EMAIL_PROVIDER_ACTIVE
```

`apps/login/src/lib/server/register.test.ts` pins the invariant for all three
paths, including that the passkey path does not mint a `verificationCheck` cookie
for an unverified user. Verified end to end against a real instance: password
sign-up lands on `/verify` and then `/signedin`; passkey sign-up lands on
`/verify` and then `/authenticator/set` to enrol the passkey; an abandoned,
unverified sign-up that comes back through `/loginname` is sent to `/verify`
rather than signed in; an already-verified user signs in normally.

### Notification links are capped at 200 runes, and a device grant does not fit

Every `url_template` ZITADEL accepts on a notification is validated as
`{min_len: 1, max_len: 200}` runes — the verification mail
(`proto/zitadel/user/v2/email.proto`), the invite, the password reset link and
the Email-OTP challenge alike. Breaching it is not a soft failure and not a
delivery problem: the gRPC call is rejected with `InvalidArgument`, so no code is
ever generated, nothing is queued, and the **instance logs nothing at all** —
it was never asked to send anything.

The login app appended the flow's `requestId` to every one of those templates
(upstream b61ad1e5a, "preserve OIDC request context during email verification").
That is fine for an OIDC or SAML id — `oidc_V2_<18 digits>`, 26 runes — and fatal
for a device grant, because a `device_` id **is** the encrypted device
authorization request: a JWE of ~264 runes, over the cap on its own.

So sign-up through the device flow — the path venho-desktop and Mind 2 use, the
only one with live users — never sent a verification mail at all. Three things
hid it: `trySendVerification` swallows the error, `checkEmailVerification`
redirects to `/verify` regardless, and `/verify` said "enter the code provided in
the verification email" unconditionally. Upstream never hit it because upstream
does not send at sign-up at all; the fork's mandatory verification is what turned
a latent bug into a wall.

- `apps/login/src/lib/url-template.ts` is the one place that knows the cap.
  `appendRequestIdToUrlTemplate` adds the requestId only when it is not a device
  id **and** the result still fits, so no notification can be taken down by its
  own flow context. It counts runes (code points), not UTF-16 units, because that
  is what the Go validator counts.
- The three builders use it: `buildVerificationUrlTemplate`
  (`lib/server/verify.ts`), the Email-OTP challenge in
  `components/login-otp.tsx`, and the password reset link in
  `lib/server/password.ts`.
- What the link gives up, the **session cookie** already holds — it has stored
  `requestId` since the session was created. `sendVerification`,
  `/otp/[method]` and `/password/set` recover it from there, so the flow still
  completes in the browser that started it. A link opened on a *different* device
  has no cookie and ends on the success page instead of resuming the grant; for a
  device grant that is harmless, because the device is polling for the token
  either way.
- **Failure is now visible.** `checkEmailVerification` marks a failed send with
  `sendFailed=true` on the `/verify` redirect and the page states it, instead of
  telling the user to read a mail that was never sent. `resendVerification`
  returns the failure rather than rejecting, and both log the reason the instance
  gave along with the offending template and its length.

`src/lib/url-template.test.ts` pins the cap arithmetic, and
`deploy/compose/tests/device-signup-email.spec.ts` is the end-to-end net: it mints
a real device authorization, drives the browser through sign-up, `/verify` and
consent, requires the mail to arrive in Mailpit, and then redeems the device
code at `/oauth/v2/token`. A mailbox-level assertion is the only kind that catches
this class of bug — every API call on the way returns 200.

### Consent comes after sign-in, and a click is what binds the device

Upstream's Login V2 asks for consent first:

    /device → /device/consent (Allow) → /loginname → … → /signedin

Allow is an `<a>` to the login page. Nothing records the decision, and the grant
is really approved by the **GET** on `/signedin` at the end, against whichever
session cookie matches. That ordering is wrong in two separate ways.

It is wrong for the user, who is asked to grant an application access to an
account they have not chosen yet — and, on a first run, that does not exist yet.
And it is wrong for security: since approval is a side effect of loading a page,
anyone could mint a device authorization, resolve its user code to a `requestId`,
and send `/signedin?requestId=device_…` to a signed-in victim, whose browser
would bind the attacker's device without a single click. `Deny` was open the
same way — `completeDeviceAuthorization(id)` with no session cancels any request
for anyone holding the id.

ZITADEL's own **legacy v1 login does it correctly**: `handleDeviceAuthAction`
(`internal/api/ui/login/device_auth.go`) refuses to render approve/deny until
`authReq.Done()`. Login V2 lost that. The fork restores it:

    /device → /accounts or /loginname → … → /device/consent (Allow) → /signedin

- **`lib/device.ts`** is the browser's own record of the device authorizations it
  started: an httpOnly cookie pairing each `requestId` with the user code it came
  from. It exists because the only server-side lookup is *by user code* while the
  login flow carries only a `requestId` — and because that id is
  `EncryptToken(deviceCode)`, minted fresh on every call, so two lookups of one
  user code return two different ids and comparing them proves nothing. The
  cookie both survives the detour through sign-up and makes the pairing
  unforgeable: approval reads the user code from *there*, never from the URL.
- **`lib/server/device.ts`** holds the three actions. `startDeviceAuthorization`
  resolves the code, remembers the pairing, and returns the identity step.
  `approveDeviceAuthorization` requires the pairing, a session cookie this
  browser holds, and that session passing the same `isSessionValid` gate as the
  rest of the flow. `denyDeviceAuthorization` requires the pairing but
  deliberately not a live session, so a user can always shut down a request they
  did not start.
- **`lib/client.ts`** is where it is enforced. Every authenticated path
  (password, passkey, IDP, registration, email verification, the account picker)
  converges on `getNextUrl`, so pointing its device branch at `/device/consent`
  moves consent for all of them at once.
- **`/signedin` no longer approves anything.** For a device request it is a
  receipt, and it says which one: approved, or denied via `?result=denied`.

`src/lib/device.test.ts`, `src/lib/server/device.test.ts` and
`src/components/consent.test.tsx` pin the refusals. The end-to-end spec asserts
the ordering *and* the attack: with the user authenticated and consent on screen,
it polls the token endpoint and loads `/signedin` directly, and both must leave
the grant `authorization_pending` until Allow is clicked. It then repeats the
whole thing in a browser that is already signed in, where the code leads to the
account picker rather than to a login form.

One consequence worth planning for: **the whole sign-up now happens inside the
device code's lifetime**, which is five minutes by default
(`ZITADEL_OIDC_DEVICEAUTH_LIFETIME`, `cmd/defaults.yaml`). Entering a code,
creating an account, fetching a verification mail and consenting does not fit
five minutes for a real person. `deploy/venho/compose.dev.yml` sets 15m; deployed
instances need the same, and `venho-desktop` must restart the grant cleanly on
`expired_token`.

## Staying in sync with upstream

Treat upstream as a dependency, not a one-time import:

```bash
git fetch upstream --tags
git switch -c update-vX.Y.Z && git merge --no-ff vX.Y.Z
pnpm install && pnpm nx run-many --target generate
pnpm --filter @zitadel/login test-unit
pnpm nx run @zitadel/login:build
```

Then re-run the device-grant check below before promoting, and record the tested
upstream version in the release notes.

## Build and deploy

```bash
pnpm nx run @zitadel/login:build
docker build -t <registry>/venho-login:v4.17.1-venho.1 apps/login
```

Tag immutably as `<upstream version>-venho.<revision>`. Never deploy `latest`.

### `public/` had to be copied to a different place

`apps/login`'s `build` script is an upstream file we have edited, so a merge can
quietly revert it. It used to run:

    cp -r public scripts/* .next/standalone/

but the server is started as `.next/standalone/apps/login/server.js` and Next
serves static files from `<server dir>/public`, i.e.
`.next/standalone/apps/login/public` — one level down from where the copy landed.
Next's `output: standalone` never copies `public` itself, so **every file under
`public/` 404s in any container build**: our logo and glows, and upstream's own
`grid-*.svg` and `favicon.ico` with them. Pages and `_next/static` are unaffected,
which is what makes it look like a routing or proxy problem rather than a
packaging one. The script now copies `public` into `.next/standalone/apps/login/`,
matching what it already does for `.next/static`.

Worth reporting upstream — nothing about it is Venho-specific.

After any upstream merge that touches `apps/login/package.json`, re-check with:

    pnpm nx run @zitadel/login:build --skip-nx-cache
    ls apps/login/.next/standalone/apps/login/public


Runtime environment:

- `ZITADEL_API_URL` — the instance, no trailing slash
- `NEXT_PUBLIC_BASE_PATH=/ui/v2/login`
- `ZITADEL_SERVICE_USER_TOKEN_FILE` — mounted secret; never bake the PAT into
  the image

We serve from the **same origin** as the instance: the proxy in front of
`auth.dev.venho.ai` routes `/ui/v2/login/*` to this app on port 3000 and
everything else to ZITADEL. That avoids registering a Trusted Domain and all the
cross-origin cookie and `x-zitadel-public-host` handling a separate domain needs.

### The proxy MUST also rewrite `/device`

This one bites silently. ZITADEL hands the device its verification URI as
`https://<external domain>/device`, and the handler behind that path
(`RedirectDeviceAuthToPrefix`, `internal/api/ui/login/device_auth.go`) redirects
unconditionally to `/ui/login/device` — the **legacy v1 login UI**. It does not
consult the Login V2 base URI, there is no config setting for it in v4.17.1
(`DefaultLoginURLV2` covers OIDC and SAML only), and `loginV2.required: true`
does not change it. Verified on a real instance: `/device?user_code=…` follows two
redirects and serves the v1 page with a 200.

So with only the `/ui/v2/login` rule in place, every venho-desktop and Mind 2
user lands on the old login UI and never sees this app. The proxy has to send
`/device` here too:

| Path | Target | Rewrite |
|---|---|---|
| `/device` | login app | `/ui/v2/login/device` (preserve `?user_code=`) |
| `/ui/v2/login/*` | login app | — |
| everything else | ZITADEL API | — |

In Traefik terms that is a router on ``Path(`/device`)`` at a higher priority
than the catch-all, pointing at the `zitadel-login` service with a
`replacepathregex` onto `/ui/v2/login/device`. Patching the Go handler is not an
option for us: we deploy the stock `ghcr.io/zitadel/zitadel` image and build only
the login app.

**Status: specified, not yet exercised end to end.** The local harness runs the
login app directly on :3000, so this rule has not been driven through a proxy.

Cut over in two steps. Set the **Login V2 base URI** per-application on the
desktop client `386369405199657810` first and verify; only then instance-wide.
Keep a break-glass Instance Owner PAT to revert.

## Verifying the device grant

This is the path with live users, so it is the check that matters:

```bash
# in venho-desktop
VENHO_AUTH_FORCE_LOGIN=1 yarn desktop:dev
```

(The dev prefix sets `VENHO_TEST=1`, which seeds a fake session and skips
sign-in; `VENHO_AUTH_FORCE_LOGIN` is the escape hatch — see `isLoginForced()` in
`electron/src/auth/config.ts`.)

Confirm the browser opens **this** app's `/device` page with the code prefilled,
that submitting it leads to sign-in or the account picker rather than straight to
consent, that consent then names the account it will bind, that approving
completes the poll in the app, and that the granted scope still carries
`urn:zitadel:iam:org:project:id:zitadel:aud` — without it the desktop's in-app
profile editor silently 401s.

The same journey runs unattended against the local stack:

```bash
cd deploy/compose
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/device-signup-email.spec.ts
```

## Instance and server settings the designs assume

These are ZITADEL configuration, not code, and the app cannot set them for
itself:

- **TOTP issuer**, `ZITADEL_SYSTEMDEFAULTS_MULTIFACTORS_OTP_ISSUER=Venho.AI`.
  The enrolment QR encodes `otpauth://totp/<issuer>:<user>?issuer=<issuer>`, and
  the issuer is what the authenticator app files the account under. It is a
  **server default**, not an instance setting and not the instance name
  (`internal/command/user_human_otp.go:108` reads
  `c.multifactors.OTP.Issuer`, seeded from config in
  `internal/command/command.go:221`) — so no admin API call can change it and it
  cannot be set per-instance. It ships as the literal string `"ZITADEL"`; left
  alone, every Venho user's authenticator app says ZITADEL forever, because the
  issuer is baked into each QR at enrolment and changing it later does not
  update codes already enrolled. Set it before anyone enrols. Empty is *not* a
  fix: the fallback is the requested domain, i.e. `auth.dev.venho.ai`.
  `deploy/venho/compose.dev.yml` sets it for local dev; production has to set the
  same value on the ZITADEL container.
- **Device code lifetime**, `ZITADEL_OIDC_DEVICEAUTH_LIFETIME`. Consent now
  happens after sign-in, so a first-time user creates an account and verifies an
  email inside this window. The default is five minutes, which is not enough;
  local dev uses 15m and deployed instances should match.
- **Passkeys as a primary method.** The sign-up design goes straight from email
  to password; upstream shows a "Passkey or Password?" chooser whenever
  `passkeysType` is `ALLOWED`. The designs use device/WebAuthn as a *second*
  factor instead, so matching them means not allowing passkeys as the primary
  method. That is a security-policy decision, deliberately left to a human.
- **Branding**, via `apps/login/scripts/venho-branding.sh` — see above.

## Open items

- Google / Microsoft / Apple IdPs need configuring on the instance before the
  "Get started" screen's buttons do anything.
- Production issuer is unsettled; `venho-desktop`'s `AUTH_CONFIG` still defaults
  to the dev instance.
