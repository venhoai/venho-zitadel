#!/usr/bin/env bash
# Make a ZITADEL instance's emails speak as Venho.
#
# Why this exists: every mail ZITADEL sends is worded by the instance's message
# texts, and out of the box they talk about "users", "initialization" and, once
# the login app's fallback leaked through, "Zitadel Login". People signing up to
# Venho read that as an invitation to somebody else's admin console. And one of
# them really is one: the "password changed" mail's button is hardcoded to
# /ui/console (internal/notification/handlers/user_notifier.go), the admin
# console, which a Venho user has no reason to open. So this script:
#
#   1. turns the password-changed notification off (notification policy) —
#      its button cannot be pointed anywhere else;
#   2. writes Venho copy for every mail a Venho user can receive, in English;
#   3. uploads the Venho mark as the label policy logo and activates it, so the
#      template header carries it instead of nothing.
#
# Text lives in the DATABASE, per instance, like the SMTP provider: run it
# against every instance the login app fronts. Idempotent — re-running writes
# the same values. Colours are not set here: apps/login/scripts/venho-branding.sh
# owns the label policy colours, and this script's logo upload leaves them as
# they are.
#
# Only English is written. A user whose browser asks for another language gets
# that language's stock text; add a block per language when there is copy.
#
# Local dev (the default): the compose stack, with the admin PAT read out of
# the bootstrap volume.
#
#   ./seed-mail.sh
#
# Any other instance: pass the target and an IAM-owner PAT.
#
#   ZITADEL_API_URL=https://auth.dev.venho.ai ZITADEL_API_DOMAIN=auth.dev.venho.ai \
#   ZITADEL_ADMIN_TOKEN=<pat> \
#     ./seed-mail.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
API="${ZITADEL_API_URL:-http://localhost:8080}"
HOST_HEADER="${ZITADEL_API_DOMAIN:-localhost}"
LOGO="${VENHO_MAIL_LOGO:-$HERE/venho-mail-logo.png}"

PAT="${ZITADEL_ADMIN_TOKEN:-}"
if [ -z "$PAT" ]; then
  echo "no ZITADEL_ADMIN_TOKEN set; reading the local bootstrap volume"
  PAT="$(docker run --rm -v zitadel_zitadel-bootstrap:/b alpine:3 cat /b/admin.pat | tr -d '\r\n')"
fi
PAT="$(printf '%s' "$PAT" | tr -d '\r\n')"
[ -n "$PAT" ] || { echo "no admin PAT available" >&2; exit 1; }

req() { # method path [json]
  # ZITADEL refuses a write that changes nothing ("… not changed", HTTP 400).
  # For a script meant to be re-run that is success, so it counts as one.
  local out status
  out="$(curl -sS -m 15 -w '\n%{http_code}' -X "$1" \
    -H "Authorization: Bearer $PAT" -H "Host: $HOST_HEADER" \
    -H "Content-Type: application/json" \
    "$API$2" ${3:+-d "$3"})"
  status="${out##*$'\n'}"
  out="${out%$'\n'*}"
  if [ "${status:0:1}" = 2 ] || { [ "$status" = 400 ] && grep -q 'not changed' <<<"$out"; }; then
    printf '%s' "$out"
    return 0
  fi
  echo "$1 $2 -> $status $out" >&2
  return 1
}

# 1. No "password changed" mail: its button opens the admin console.
req PUT /admin/v1/policies/notification '{"passwordChange": false}' >/dev/null
echo "password-changed notification off"

# 2. The copy. {{.Placeholders}} are ZITADEL's own; each mail keeps the ones
# its stock text uses, so links and codes still arrive. Written as the login
# pages are: short, plain, about the person's Venho account.
python3 - <<'PY' | while IFS=$'\t' read -r type body; do
import json

texts = {
    # Only for an account somebody else created (an admin, an import).
    "init": {
        "title": "Finish setting up your Venho account",
        "preHeader": "Finish setting up your Venho account",
        "subject": "Finish setting up your Venho account",
        "greeting": "Hello {{.DisplayName}},",
        "text": "A Venho account was created for you, with the username {{.PreferredLoginName}}. Use the button below to finish setting it up, or enter the code {{.Code}}. If you weren't expecting this, you can ignore this email.",
        "buttonText": "Finish setup",
    },
    # Every sign-up gets this one.
    "verifyemail": {
        "title": "Verify your email for Venho",
        "preHeader": "Your verification code is {{.Code}}",
        "subject": "Verify your email for Venho",
        "greeting": "Hello {{.DisplayName}},",
        "text": "Enter this code in Venho to confirm your email address: {{.Code}}. Or use the button below. If you didn't sign up for Venho, you can ignore this email.",
        "buttonText": "Verify email",
    },
    "passwordreset": {
        "title": "Reset your Venho password",
        "preHeader": "Reset your Venho password",
        "subject": "Reset your Venho password",
        "greeting": "Hello {{.DisplayName}},",
        "text": "Someone asked to reset the password for your Venho account. Use the button below to choose a new one, or enter the code {{.Code}}. If it wasn't you, you can ignore this email and your password stays the same.",
        "buttonText": "Reset password",
    },
    "verifyemailotp": {
        "title": "Your Venho sign-in code",
        "preHeader": "Your sign-in code is {{.OTP}}",
        "subject": "Your Venho sign-in code",
        "greeting": "Hello {{.DisplayName}},",
        "text": "Your sign-in code is {{.OTP}}. It works for the next five minutes. Or use the button below to sign in.",
        "buttonText": "Sign in",
    },
    "invite_user": {
        "title": "You're invited to {{.ApplicationName}}",
        "preHeader": "You're invited to {{.ApplicationName}}",
        "subject": "You're invited to {{.ApplicationName}}",
        "greeting": "Hello {{.DisplayName}},",
        "text": "You've been invited to {{.ApplicationName}}. Use the button below to accept and set up your account. If you weren't expecting this, you can ignore this email.",
        "buttonText": "Accept invite",
    },
    # Off by the policy above; worded anyway, for an instance that turns it
    # back on.
    "password_change": {
        "title": "Your Venho password was changed",
        "preHeader": "Your Venho password was changed",
        "subject": "Your Venho password was changed",
        "greeting": "Hello {{.DisplayName}},",
        "text": "The password for your Venho account was just changed. If this wasn't you, reset your password right away.",
        "buttonText": "Sign in",
    },
    "passwordless_registration": {
        "title": "Add a passkey to your Venho account",
        "preHeader": "Add a passkey to your Venho account",
        "subject": "Add a passkey to your Venho account",
        "greeting": "Hello {{.DisplayName}},",
        "text": "Use the button below to add a passkey, so you can sign in to Venho with this device instead of a password. If you didn't ask for this, you can ignore this email.",
        "buttonText": "Add passkey",
    },
    "domainclaimed": {
        "title": "Your Venho username has changed",
        "preHeader": "Your Venho username has changed",
        "subject": "Your Venho username has changed",
        "greeting": "Hello {{.DisplayName}},",
        "text": "The domain {{.Domain}} now belongs to an organization your account {{.Username}} is not part of, so your username is now {{.TempUsername}} for the time being. Sign in with it and change your email address.",
        "buttonText": "Sign in",
    },
}

for type_, text in texts.items():
    print(type_ + "\t" + json.dumps({**text, "footerText": ""}))
PY
  req PUT "/admin/v1/text/message/$type/en" "$body" >/dev/null
  echo "wrote $type (en)"
done

# 3. The Venho mark in the mail header, light and dark. The template draws the
# logo 180px wide whatever its size, so venho-mail-logo.png is the app icon
# (console/src/assets/images/venho-email-thumbnail.png) at 192px on a clear
# 720x384 canvas: the mark lands at 48px, beside the words rather than over them.
for slot in logo logo/dark; do
  curl -sSf -m 30 -X POST \
    -H "Authorization: Bearer $PAT" -H "Host: $HOST_HEADER" \
    -F "file=@$LOGO;type=image/png" \
    "$API/assets/v1/instance/policy/label/$slot" >/dev/null
done
req POST /admin/v1/policies/label/_activate '{}' >/dev/null
echo "logo uploaded and label policy activated"

echo "done — send yourself a verification mail and read it before trusting it"
