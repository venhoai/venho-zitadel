import { describe, expect, test } from "vitest";
import {
  appendRequestIdToUrlTemplate,
  exceedsUrlTemplateLimit,
  isDeviceRequestId,
  runeLength,
  URL_TEMPLATE_MAX_RUNES,
} from "./url-template";

/**
 * VENHO FORK — the cap these helpers exist to respect is ZITADEL's own proto
 * validation (`max_len: 200` runes on every notification `url_template`).
 * Breaching it is silent from the user's side: the send is rejected, no code is
 * generated, and the page still says "enter the code from the email".
 */

const VERIFY_TEMPLATE =
  "https://auth.dev.venho.ai/ui/v2/login/verify?code={{.Code}}&userId={{.UserID}}&organization={{.OrgID}}";

// A real device authorization request id: `device_` + the encrypted request.
const DEVICE_REQUEST_ID =
  "device_eyJhbGciOiJBMjU2R0NNS1ciLCJlbmMiOiJBMjU2R0NNIiwiaXYiOiJ0dV8tbDUzR1RBMzRyWFZGIiwia2lkIjoib2lkY0tleSIsInRhZyI6IllWVWx5LTdUemZ4SFBqeVJNSUdrZncifQ.LmRAc-8KGascor8cDVwwxDXEWa4IKRMDF0HQ9gIcOBk.OBIxFFX3PqJlqERv.6s9GcORPjyule8ltyammelkEpkpBPw.f5bPuKgVOeCWXUnHdPI3zg";

const OIDC_REQUEST_ID = "oidc_V2_388456676392435715";

describe("the 200-rune cap", () => {
  test("a device requestId overruns it on its own", () => {
    expect(runeLength(DEVICE_REQUEST_ID)).toBeGreaterThan(URL_TEMPLATE_MAX_RUNES);
  });

  test("runes are counted as code points, not UTF-16 units", () => {
    // An emoji is two UTF-16 units and one rune — Go's validator counts one.
    expect("👍".length).toBe(2);
    expect(runeLength("👍")).toBe(1);
  });

  test("a bare verification template is well inside the cap", () => {
    expect(exceedsUrlTemplateLimit(VERIFY_TEMPLATE)).toBe(false);
  });
});

describe("appendRequestIdToUrlTemplate", () => {
  test("drops a device requestId — this is the bug that stopped every device sign-up", () => {
    const result = appendRequestIdToUrlTemplate(VERIFY_TEMPLATE, DEVICE_REQUEST_ID);

    expect(result).toBe(VERIFY_TEMPLATE);
    expect(result).not.toContain("requestId");
    expect(exceedsUrlTemplateLimit(result)).toBe(false);
  });

  test("keeps an OIDC requestId, which is what the parameter is for", () => {
    const result = appendRequestIdToUrlTemplate(VERIFY_TEMPLATE, OIDC_REQUEST_ID);

    expect(result).toBe(`${VERIFY_TEMPLATE}&requestId=${OIDC_REQUEST_ID}`);
    expect(exceedsUrlTemplateLimit(result)).toBe(false);
  });

  test("URL-encodes the value, so a crafted id cannot add parameters of its own", () => {
    expect(appendRequestIdToUrlTemplate(VERIFY_TEMPLATE, "req&id=injected")).toBe(
      `${VERIFY_TEMPLATE}&requestId=req%26id%3Dinjected`,
    );
  });

  test("drops any requestId that would breach the cap, device or not", () => {
    const longButNotDevice = `oidc_V2_${"9".repeat(120)}`;

    expect(appendRequestIdToUrlTemplate(VERIFY_TEMPLATE, longButNotDevice)).toBe(VERIFY_TEMPLATE);
  });

  test("appends right up to the cap, and not past it", () => {
    const room = URL_TEMPLATE_MAX_RUNES - runeLength(`${VERIFY_TEMPLATE}&requestId=`);
    const exactFit = "a".repeat(room);

    const fitted = appendRequestIdToUrlTemplate(VERIFY_TEMPLATE, exactFit);
    expect(runeLength(fitted)).toBe(URL_TEMPLATE_MAX_RUNES);

    const oneTooMany = appendRequestIdToUrlTemplate(VERIFY_TEMPLATE, `${exactFit}a`);
    expect(oneTooMany).toBe(VERIFY_TEMPLATE);
  });

  test("uses ? when the template has no query of its own", () => {
    expect(appendRequestIdToUrlTemplate("https://example.com/verify", OIDC_REQUEST_ID)).toBe(
      `https://example.com/verify?requestId=${OIDC_REQUEST_ID}`,
    );
  });

  test("leaves the template alone when there is no requestId", () => {
    expect(appendRequestIdToUrlTemplate(VERIFY_TEMPLATE, undefined)).toBe(VERIFY_TEMPLATE);
    expect(appendRequestIdToUrlTemplate(VERIFY_TEMPLATE, "")).toBe(VERIFY_TEMPLATE);
  });
});

describe("isDeviceRequestId", () => {
  test.each([
    [DEVICE_REQUEST_ID, true],
    ["device_anything", true],
    [OIDC_REQUEST_ID, false],
    ["saml_123", false],
    [undefined, false],
  ])("%s → %s", (requestId, expected) => {
    expect(isDeviceRequestId(requestId as string | undefined)).toBe(expected);
  });
});
