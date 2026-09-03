import { expect, test } from "@playwright/test";

/**
 * Regression net for the sign-up verification email.
 *
 * Email verification is mandatory on every sign-up path (VENHO.md), and the
 * failure mode it guards against is SILENT: SendEmailCode returns 200 even
 * when the instance has no SMTP provider — delivery dies asynchronously in
 * the notification handler ("could not create email channel") while the UI
 * claims a code was sent. Only a mailbox-level assertion catches that, so
 * this test drives a real browser sign-up and requires the mail to actually
 * arrive in the Mailpit catcher from compose.dev.yml.
 *
 * Prerequisites: the dev stack (with mailpit + seeded SMTP) and the login app
 * on :3000 (`pnpm --filter @zitadel/login dev`). Skips if either is absent.
 */

// Hosts without a playwright-bundled chromium (e.g. ubuntu 26.04) can point
// this at the system browser: PLAYWRIGHT_CHANNEL=chrome
const channel = process.env.PLAYWRIGHT_CHANNEL;
if (channel) test.use({ channel });

const LOGIN = process.env.LOGIN_BASE_URL ?? "http://localhost:3000/ui/v2/login";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

test("sign-up triggers a verification email", async ({ page, request }) => {
  const mailpitUp = await request.get(`${MAILPIT}/api/v1/info`).then(
    (r) => r.ok(),
    () => false,
  );
  test.skip(!mailpitUp, `Mailpit not reachable at ${MAILPIT} — start the dev stack with compose.dev.yml`);

  const loginUp = await request.get(`${LOGIN}/loginname`).then(
    (r) => r.ok(),
    () => false,
  );
  test.skip(!loginUp, `login app not reachable at ${LOGIN} — pnpm --filter @zitadel/login dev`);

  const email = `signup-e2e-${Date.now()}@venho.localhost`;

  await page.goto(`${LOGIN}/register`);
  await page.getByTestId("firstname-text-input").fill("Signup");
  await page.getByTestId("lastname-text-input").fill("E2E");
  await page.getByTestId("email-text-input").fill(email);

  // Accept ToS/privacy when the instance shows them.
  for (const id of ["tos-checkbox", "privacypolicy-checkbox"]) {
    const box = page.getByTestId(id);
    if (await box.count()) await box.click();
  }

  // If a method chooser is shown, pick password.
  const pwRadio = page.getByTestId("password-radio");
  if (await pwRadio.count()) await pwRadio.click();

  await page.getByTestId("submit-button").click();

  await page.getByTestId("password-text-input").waitFor({ timeout: 15000 });
  await page.getByTestId("password-text-input").fill("SignupE2e!12345");
  await page.getByTestId("password-confirm-text-input").fill("SignupE2e!12345");
  await page.getByTestId("submit-button").click();

  // The flow must land on /verify and claim the code was sent…
  await page.waitForURL(/\/verify\?/, { timeout: 30000 });
  expect(new URL(page.url()).searchParams.get("codeSent")).toBe("true");

  // …and the claim must be true: the mail exists in the catcher.
  let found: { Subject: string } | null = null;
  for (let i = 0; i < 20 && !found; i++) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
    const data = await res.json();
    found = data.messages?.[0] ?? null;
    if (!found) await page.waitForTimeout(1000);
  }
  expect(found, `no verification email arrived for ${email}`).toBeTruthy();
});
