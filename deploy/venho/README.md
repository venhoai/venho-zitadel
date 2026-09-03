# Local ZITADEL for login development

Brings up a throwaway ZITADEL against which the login app can be developed and
screenshotted. Everything it creates is disposable — never point it at real data.

```sh
cd deploy/compose
cp .env.test .env            # then set ZITADEL_VERSION to the fork point, e.g. v4.17.1
docker compose -f docker-compose.yml -f ../venho/compose.dev.yml up -d postgres zitadel-api

# both PATs are written to a volume by the API on first boot
docker run --rm -v zitadel_zitadel-bootstrap:/b alpine:3 cat /b/login-client.pat
docker run --rm -v zitadel_zitadel-bootstrap:/b alpine:3 cat /b/admin.pat
```

Put the login-client PAT in `apps/login/.env.local` (**not** `.env.dev.local` —
Next does not load that name, so the app silently falls back to `.env` and every
API call fails with "fetch() returned undefined"):

```dotenv
ZITADEL_API_URL=http://localhost:8080
ZITADEL_SERVICE_USER_TOKEN=<login-client.pat>
ZITADEL_SERVICE_USER_TOKEN_FILE=
CUSTOM_REQUEST_HEADERS=Host:localhost,X-Forwarded-Proto:http
```

`CUSTOM_REQUEST_HEADERS` matters: the instance's external domain is `localhost`
but the API is published on :8080, so without an explicit Host header ZITADEL
cannot resolve the instance.

Then seed the branding — the login app reads colours from the instance, so
without this you get ZITADEL blue:

```sh
ZITADEL_API_URL=http://localhost:8080 ZITADEL_API_DOMAIN=localhost \
  ZITADEL_ADMIN_TOKEN=<admin.pat> apps/login/scripts/venho-branding.sh
```

Then seed SMTP — email verification is mandatory on every sign-up path, and
provider config lives in the **database** (`ZITADEL_DEFAULTINSTANCE_*` only
applies at instance creation), so a stack without this step cannot complete a
sign-up: `SendEmailCode` returns 200, the notification handler logs
`could not create email channel … SMTPConfig.NotFound`, and the user waits on
`/verify` forever while the UI claims a code was sent. The overlay starts a
[Mailpit](https://mailpit.axllent.org/) catcher; point the instance at it once:

```sh
../venho/seed-smtp.sh     # idempotent; uses the admin PAT from the volume
```

Every mail the instance sends then appears at <http://localhost:8025> —
verification codes included, so the full sign-up flow is testable end to end.

The same script points any other instance at a real relay — nothing in it is
Mailpit-specific except the defaults:

```sh
ZITADEL_API_URL=https://auth.dev.venho.ai ZITADEL_ADMIN_TOKEN=<pat> \
  SMTP_HOST=smtp.example.net:587 SMTP_TLS=true \
  SMTP_SENDER=noreply@venho.ai SMTP_SENDER_NAME=Venho \
  SMTP_USER=<relay user> SMTP_PASSWORD=<secret> \
  ../venho/seed-smtp.sh
```

## Testing the sign-up flows

Two Playwright specs in `deploy/compose/tests/` drive real browsers against this
stack and assert the mail actually lands in Mailpit — the only assertion that
catches a send that failed, since every API call on the way returns 200:

```sh
cd ../compose
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/signup-email.spec.ts
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/device-signup-email.spec.ts
```

`signup-email` covers plain registration. `device-signup-email` covers the path
with live users: it mints a real RFC 8628 device authorization, walks consent →
sign-up → `/verify`, and finishes by redeeming the device code for tokens.
`PLAYWRIGHT_CHANNEL=chrome` uses the system browser, for hosts where playwright
cannot install its own chromium.

Finally `pnpm --filter @zitadel/login dev` and open
<http://localhost:3000/ui/v2/login/loginname>.

The overlay also pins `ZITADEL_SYSTEMDEFAULTS_MULTIFACTORS_OTP_ISSUER=Venho.AI`
so enrolment QRs here match production. Check it after any change to the API
container — the value is baked into each QR at enrolment, so a wrong one is only
fixable by re-enrolling every user:

```sh
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' zitadel-zitadel-api-1 \
  | grep OTP_ISSUER   # the image is distroless: no shell, no printenv
```

## Exercising the device grant

This is the path venho-desktop and Mind 2 use, so it is worth driving for real
rather than visiting `/device` by hand. Create a project and a native OIDC app
with the `OIDC_GRANT_TYPE_DEVICE_CODE` grant, then:

```sh
curl -X POST http://localhost:8080/oauth/v2/device_authorization -H "Host: localhost" \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "scope=openid profile email offline_access urn:zitadel:iam:org:project:id:$PROJECT_ID:aud urn:zitadel:iam:org:project:id:zitadel:aud"
```

Use the returned `user_code` at `/ui/v2/login/device?user_code=…`, complete the
flow, then redeem the `device_code` at `/oauth/v2/token` with
`grant_type=urn:ietf:params:oauth:grant-type:device_code`. A successful redemption
is the only proof the flow actually worked — the browser reaching "Authorization
approved" is not.
