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
- `apps/login/src/components/theme-provider.tsx` — `defaultTheme` is `dark`
  (upstream: `system`). Every designed screen is dark, as is the app being signed
  into.
- `apps/login/src/components/theme-wrapper.tsx` — branding `themeMode`
  `UNSPECIFIED` no longer forces `system`. Upstream lumps it in with `AUTO`,
  which would defeat the dark default on any instance that never set the field.
  An explicit `AUTO` still wins.
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
that approving completes the poll in the app, and that the granted scope still
carries `urn:zitadel:iam:org:project:id:zitadel:aud` — without it the desktop's
in-app profile editor silently 401s.

## Instance settings the designs assume

These are ZITADEL configuration, not code, and the app cannot set them for
itself:

- **Instance name.** The TOTP enrolment QR encodes
  `otpauth://totp/<instance>:<user>?issuer=<instance>`, so on a stock instance
  the user's authenticator app files Venho under "ZITADEL" forever — renaming it
  later does not update codes already enrolled. Set the instance name before
  anyone enrols.
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
