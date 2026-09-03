#!/usr/bin/env bash
# Point a ZITADEL instance's SMTP provider at a mail server, and activate it.
#
# Why this exists: email verification is mandatory on every sign-up path, but
# SMTP provider config lives in the DATABASE — ZITADEL_DEFAULTINSTANCE_* env
# only applies when an instance is first created, so an already-initialised
# instance silently has no mail delivery: SendEmailCode returns 200 and the
# notification handler then logs "could not create email channel". This script
# closes that gap. Idempotent: re-running it updates and re-activates the
# provider it already created.
#
# Local dev (the default): the Mailpit catcher from compose.dev.yml, with the
# admin PAT read out of the bootstrap volume.
#
#   ./seed-smtp.sh
#
# Any other instance: pass the target and an IAM-owner PAT, plus the relay.
# Nothing here is Mailpit-specific except the defaults.
#
#   ZITADEL_API_URL=https://auth.dev.venho.ai \
#   ZITADEL_ADMIN_TOKEN=<pat> \
#   SMTP_HOST=smtp.eu.mailgun.org:587 SMTP_TLS=true \
#   SMTP_SENDER=noreply@venho.ai SMTP_SENDER_NAME=Venho \
#   SMTP_USER=postmaster@venho.ai SMTP_PASSWORD=<secret> \
#     ./seed-smtp.sh
#
# Verify afterwards — the provider must be listed AND state EMAIL_PROVIDER_ACTIVE:
#
#   curl -sS -X POST "$ZITADEL_API_URL/admin/v1/email/_search" \
#     -H "Authorization: Bearer $ZITADEL_ADMIN_TOKEN" -d '{}'
set -euo pipefail

API="${ZITADEL_API_URL:-http://localhost:8080}"
HOST_HEADER="${ZITADEL_API_DOMAIN:-localhost}"

SMTP_HOST="${SMTP_HOST:-zitadel-mailpit:1025}"
SMTP_SENDER="${SMTP_SENDER:-noreply@venho.localhost}"
SMTP_SENDER_NAME="${SMTP_SENDER_NAME:-Venho}"
SMTP_TLS="${SMTP_TLS:-false}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASSWORD="${SMTP_PASSWORD:-}"
SMTP_DESCRIPTION="${SMTP_DESCRIPTION:-Venho ($SMTP_HOST)}"

# The local stack writes an admin PAT to a volume on first boot. Read it with a
# throwaway alpine — the zitadel image is distroless and its `cat` truncates.
PAT="${ZITADEL_ADMIN_TOKEN:-}"
if [ -z "$PAT" ]; then
  echo "no ZITADEL_ADMIN_TOKEN set; reading the local bootstrap volume"
  PAT="$(docker run --rm -v zitadel_zitadel-bootstrap:/b alpine:3 cat /b/admin.pat | tr -d '\r\n')"
fi
# A trailing newline in the Authorization header makes Go's http server answer a
# bare "400 Bad Request" before routing, which reads like a broken endpoint.
PAT="$(printf '%s' "$PAT" | tr -d '\r\n')"
[ -n "$PAT" ] || { echo "no admin PAT available" >&2; exit 1; }

req() { # method path [json]
  curl -sSf -m 15 -X "$1" \
    -H "Authorization: Bearer $PAT" -H "Host: $HOST_HEADER" \
    -H "Content-Type: application/json" \
    "$API/admin/v1$2" ${3:+-d "$3"}
}

payload="$(SMTP_HOST="$SMTP_HOST" SMTP_SENDER="$SMTP_SENDER" SMTP_SENDER_NAME="$SMTP_SENDER_NAME" \
  SMTP_TLS="$SMTP_TLS" SMTP_USER="$SMTP_USER" SMTP_PASSWORD="$SMTP_PASSWORD" \
  SMTP_DESCRIPTION="$SMTP_DESCRIPTION" python3 -c '
import json, os
body = {
    "description": os.environ["SMTP_DESCRIPTION"],
    "senderAddress": os.environ["SMTP_SENDER"],
    "senderName": os.environ["SMTP_SENDER_NAME"],
    "tls": os.environ["SMTP_TLS"].lower() == "true",
    "host": os.environ["SMTP_HOST"],
}
# user/password are only sent when set: an empty user means no authentication,
# which is what a local catcher wants and what a real relay must never get.
if os.environ["SMTP_USER"]:
    body["user"] = os.environ["SMTP_USER"]
    body["password"] = os.environ["SMTP_PASSWORD"]
print(json.dumps(body))
')"

# Find the provider we manage (matched on host), else create one.
ID="$(req POST /email/_search '{}' | SMTP_HOST="$SMTP_HOST" python3 -c '
import json, os, sys
host = os.environ["SMTP_HOST"]
for p in json.load(sys.stdin).get("result", []):
    cfg = p.get("smtpConfig") or p.get("smtp") or {}
    if cfg.get("host") == host:
        print(p.get("id", ""))
        break
')"

if [ -z "$ID" ]; then
  ID="$(req POST /email/smtp "$payload" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  echo "created SMTP provider $ID -> $SMTP_HOST"
else
  req PUT "/email/smtp/$ID" "$payload" >/dev/null
  echo "updated SMTP provider $ID -> $SMTP_HOST"
fi

req POST "/email/$ID/_activate" '{}' >/dev/null 2>&1 \
  && echo "provider $ID active" \
  || echo "provider $ID was already active"

if [ "$SMTP_HOST" = "zitadel-mailpit:1025" ]; then
  echo "done — watch deliveries at http://localhost:8025"
else
  echo "done — send a test mail and confirm it arrives before trusting sign-up"
fi
