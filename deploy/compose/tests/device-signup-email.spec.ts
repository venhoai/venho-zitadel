import { expect, test } from "@playwright/test";

/**
 * Regression net for the DEVICE-GRANT sign-up path — the one venho-desktop and
 * Mind 2 actually use (VENHO.md "Why this exists").
 *
 * Mints a real RFC 8628 device authorization request against the local
 * instance, walks the browser through the flow, and asserts the things that are
 * otherwise silent:
 *   1. consent comes AFTER identity — submitting the user code leads to sign-in,
 *      not to an Allow button for an account that does not exist yet;
 *   2. the verification email really arrives in Mailpit (SendEmailCode returns
 *      200 even with no SMTP provider — only the mailbox proves delivery);
 *   3. loading /signedin does NOT approve the grant, which it used to do, so a
 *      link was enough to bind a device to any signed-in browser;
 *   4. clicking Allow does, and the grant is then redeemable at /oauth/v2/token.
 *
 * Prerequisites: the dev stack (compose.dev.yml, Mailpit, seeded SMTP) and the
 * login app on :3000. Skips if either is absent.
 *
 *   PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/device-signup-email.spec.ts
 */

const channel = process.env.PLAYWRIGHT_CHANNEL;
if (channel) test.use({ channel });

const API = process.env.ZITADEL_API_URL ?? "http://localhost:8080";
const API_HOST = process.env.ZITADEL_API_DOMAIN ?? "localhost";
const LOGIN = process.env.LOGIN_BASE_URL ?? "http://localhost:3000/ui/v2/login";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
// "Venho Desktop" native app in the local Venho project (device grant enabled).
const CLIENT_ID = process.env.DEVICE_CLIENT_ID ?? "388456676392501251";
const SCOPE = "openid profile email offline_access urn:zitadel:iam:org:project:id:zitadel:aud";

test("device-grant sign-up: consent after identity, and only a click binds the device", async ({ page, request }) => {
  test.setTimeout(180_000);

  const mailpitUp = await request.get(`${MAILPIT}/api/v1/info`).then(
    (r) => r.ok(),
    () => false,
  );
  test.skip(!mailpitUp, `Mailpit not reachable at ${MAILPIT}`);
  const loginUp = await request.get(`${LOGIN}/loginname`).then(
    (r) => r.ok(),
    () => false,
  );
  test.skip(!loginUp, `login app not reachable at ${LOGIN}`);

  const pollToken = async () => {
    const res = await request.post(`${API}/oauth/v2/token`, {
      headers: { Host: API_HOST, "Content-Type": "application/x-www-form-urlencoded" },
      form: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: CLIENT_ID, device_code },
    });
    return { ok: res.ok(), json: await res.json() };
  };

  // 1. What the desktop app does: mint a device authorization request.
  const da = await request.post(`${API}/oauth/v2/device_authorization`, {
    headers: { Host: API_HOST, "Content-Type": "application/x-www-form-urlencoded" },
    form: { client_id: CLIENT_ID, scope: SCOPE },
  });
  expect(da.ok(), await da.text()).toBeTruthy();
  const { user_code, device_code, verification_uri_complete } = await da.json();
  console.log("device authorization:", { user_code, verification_uri_complete });

  const email = `device-signup-${Date.now()}@venho.localhost`;
  const password = "DeviceSignup!12345";

  // 2. Browser lands on the user-code page (the proxy's /device rewrite).
  await page.goto(`${LOGIN}/device?user_code=${encodeURIComponent(user_code)}`);
  await page.getByTestId("submit-button").click();

  // 3. Identity FIRST. A fresh browser has no sessions, so the code leads to
  //    /loginname — never to a consent screen for nobody.
  await page.waitForURL(/\/loginname\?/, { timeout: 20_000 });
  expect(page.url()).toMatch(/requestId=device_/);
  const requestId = new URL(page.url()).searchParams.get("requestId")!;

  // 4. Sign up.
  await page.getByTestId("register-button").click();
  await page.waitForURL(/\/register\?/, { timeout: 20_000 });
  expect(page.url()).toMatch(/requestId=device_/);
  await page.getByTestId("firstname-text-input").fill("Device");
  await page.getByTestId("lastname-text-input").fill("Signup");
  await page.getByTestId("email-text-input").fill(email);
  for (const id of ["tos-checkbox", "privacypolicy-checkbox"]) {
    const box = page.getByTestId(id);
    if (await box.count()) await box.click();
  }
  const pwRadio = page.getByTestId("password-radio");
  if (await pwRadio.count()) await pwRadio.click();
  await page.getByTestId("submit-button").click();

  await page.getByTestId("password-text-input").waitFor({ timeout: 20_000 });
  await page.getByTestId("password-text-input").fill(password);
  await page.getByTestId("password-confirm-text-input").fill(password);
  await page.getByTestId("submit-button").click();

  // 5. Must land on /verify with the device requestId AND the codeSent claim…
  await page.waitForURL(/\/verify\?/, { timeout: 30_000 });
  const verifyUrl = new URL(page.url());
  console.log("verify url:", verifyUrl.search);
  expect(verifyUrl.searchParams.get("requestId")).toMatch(/^device_/);
  expect(verifyUrl.searchParams.get("codeSent")).toBe("true");

  // …and the claim must be true.
  let msg: { ID: string; Subject: string } | null = null;
  for (let i = 0; i < 20 && !msg; i++) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
    msg = (await res.json()).messages?.[0] ?? null;
    if (!msg) await page.waitForTimeout(1000);
  }
  expect(msg, `no verification email arrived for ${email}`).toBeTruthy();

  // 6. Pull the code out of the mail and finish verification.
  const body = await request.get(`${MAILPIT}/api/v1/message/${msg!.ID}`).then((r) => r.json());
  const text: string = body.Text ?? "";
  const codeMatch = text.match(/code=([A-Za-z0-9]+)/) ?? text.match(/\b([A-Z0-9]{6})\b/);
  expect(codeMatch, `no code found in mail:\n${text}`).toBeTruthy();
  const code = codeMatch![1];
  console.log("verification code:", code, "subject:", msg!.Subject);

  // CodeInput puts the test id on the first box; typing fills the rest.
  await page.getByTestId("code-text-input").click();
  await page.keyboard.type(code);
  await page.getByTestId("submit-button").click();

  // 7. NOW consent — the user is authenticated and the screen says as whom.
  await page.waitForURL(/\/device\/consent\?/, { timeout: 30_000 });
  // :visible matters here. The consent page makes several API calls before it
  // can render, so React streams it in two chunks, and for a moment after a
  // hard load the document holds the streamed copy AND the hidden staging one.
  const allow = page.locator('[data-testid="submit-button"]:visible');
  await allow.waitFor({ timeout: 20_000 });
  await expect(page.getByTestId("continue-as")).toContainText(email.split("@")[0], { ignoreCase: true });
  const consentUrl = page.url();

  // 8. Nothing has been granted yet, and merely loading the old completion page
  //    must not grant it. This is the link attack the reorder closed.
  let pending = await pollToken();
  expect(pending.json.error, "the grant was approved before anyone clicked Allow").toBe("authorization_pending");

  await page.goto(`${LOGIN}/signedin?requestId=${encodeURIComponent(requestId)}`);
  pending = await pollToken();
  expect(pending.json.error, "loading /signedin approved the grant with no consent").toBe("authorization_pending");

  // 9. Back to consent, and this time click Allow. Re-navigating rather than
  //    going back in history: a restored page keeps the previous document's
  //    buttons around, and the click then has two candidates.
  await page.goto(consentUrl);
  await allow.click();

  await page.waitForURL(/\/signedin\?/, { timeout: 30_000 });
  await expect(page.getByTestId("status-panel")).toBeVisible();
  console.log("terminal url:", new URL(page.url()).search);

  let token: any = null;
  for (let i = 0; i < 10 && !token; i++) {
    const { ok, json } = await pollToken();
    if (ok && json.access_token) token = json;
    else {
      console.log("token poll:", json.error, json.error_description ?? "");
      await page.waitForTimeout(2000);
    }
  }
  expect(token, "device grant never became redeemable").toBeTruthy();

  // 10. A second device, in a browser that is now signed in. The user code
  //     leads to the account picker — identity is still chosen before consent,
  //     it is just chosen rather than created — and consent still has to be
  //     given for this new grant.
  const second = await request.post(`${API}/oauth/v2/device_authorization`, {
    headers: { Host: API_HOST, "Content-Type": "application/x-www-form-urlencoded" },
    form: { client_id: CLIENT_ID, scope: SCOPE },
  });
  const secondAuth = await second.json();

  await page.goto(`${LOGIN}/device?user_code=${encodeURIComponent(secondAuth.user_code)}`);
  await page.getByTestId("submit-button").click();

  await page.waitForURL(/\/accounts\?/, { timeout: 20_000 });
  expect(page.url()).toMatch(/requestId=device_/);
  await page.getByTestId("continue-as-button").click();

  await page.waitForURL(/\/device\/consent\?/, { timeout: 20_000 });
  const secondAllow = page.locator('[data-testid="submit-button"]:visible');
  await secondAllow.waitFor({ timeout: 20_000 });

  const stillPending = await request.post(`${API}/oauth/v2/token`, {
    headers: { Host: API_HOST, "Content-Type": "application/x-www-form-urlencoded" },
    form: {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: CLIENT_ID,
      device_code: secondAuth.device_code,
    },
  });
  expect((await stillPending.json()).error, "an existing session approved the grant on its own").toBe(
    "authorization_pending",
  );

  await secondAllow.click();
  await page.waitForURL(/\/signedin\?/, { timeout: 30_000 });

  let secondToken: any = null;
  for (let i = 0; i < 10 && !secondToken; i++) {
    const res = await request.post(`${API}/oauth/v2/token`, {
      headers: { Host: API_HOST, "Content-Type": "application/x-www-form-urlencoded" },
      form: {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: CLIENT_ID,
        device_code: secondAuth.device_code,
      },
    });
    const json = await res.json();
    if (res.ok() && json.access_token) secondToken = json;
    else await page.waitForTimeout(2000);
  }
  expect(secondToken, "the signed-in device grant never became redeemable").toBeTruthy();
});
