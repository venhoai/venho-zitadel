#!/usr/bin/env bash
# Let every existing person delete their own account.
#
# Why this exists: ZITADEL grants `user.self.delete` only through a membership
# role — ORG_USER_SELF_MANAGER in the user's organization, or
# SELF_MANAGEMENT_GLOBAL on the instance. The login app now grants the first at
# every sign-up (apps/login/src/lib/server/self-management.ts), but people who
# signed up before that hold nothing, so "Delete account" in Venho answers
# PermissionDenied for them. This script gives each human user the role in
# their own organization.
#
# Idempotent: a user who is already a member of their organization (with this
# role or any other) is left as they are, and counted as skipped.
#
# Local dev (the default): the compose stack, admin PAT from the bootstrap
# volume.
#
#   ./grant-self-delete.sh
#
# Any other instance: pass the target and an IAM-owner PAT. DRY_RUN=1 lists who
# would be granted without writing anything.
#
#   ZITADEL_API_URL=https://auth.dev.venho.ai ZITADEL_API_DOMAIN=auth.dev.venho.ai \
#   ZITADEL_ADMIN_TOKEN=<pat> DRY_RUN=1 \
#     ./grant-self-delete.sh
set -euo pipefail

API="${ZITADEL_API_URL:-http://localhost:8080}"
HOST_HEADER="${ZITADEL_API_DOMAIN:-localhost}"
DRY_RUN="${DRY_RUN:-}"

PAT="${ZITADEL_ADMIN_TOKEN:-}"
if [ -z "$PAT" ]; then
  echo "no ZITADEL_ADMIN_TOKEN set; reading the local bootstrap volume"
  PAT="$(docker run --rm -v zitadel_zitadel-bootstrap:/b alpine:3 cat /b/admin.pat | tr -d '\r\n')"
fi
PAT="$(printf '%s' "$PAT" | tr -d '\r\n')"
[ -n "$PAT" ] || { echo "no admin PAT available" >&2; exit 1; }

API="$API" HOST_HEADER="$HOST_HEADER" PAT="$PAT" DRY_RUN="$DRY_RUN" python3 - <<'PY'
import json, os, sys, urllib.error, urllib.request

api, host, pat, dry = os.environ["API"], os.environ["HOST_HEADER"], os.environ["PAT"], bool(os.environ["DRY_RUN"])

def call(path, body):
    req = urllib.request.Request(
        api + path,
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Authorization": "Bearer " + pat, "Host": host, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read() or b"{}")

granted = skipped = failed = 0
offset, page = 0, 200
while True:
    status, body = call("/v2/users", {
        "query": {"offset": str(offset), "limit": page, "asc": True},
        "queries": [{"typeQuery": {"type": "TYPE_HUMAN"}}],
    })
    if status != 200:
        sys.exit(f"listing users failed: {status} {body}")
    users = body.get("result", [])
    for user in users:
        user_id = user["userId"]
        org_id = user["details"]["resourceOwner"]
        name = user.get("preferredLoginName") or user.get("username") or user_id
        if dry:
            print(f"would grant {name} ({user_id}) in {org_id}")
            continue
        status, res = call(
            "/zitadel.internal_permission.v2.InternalPermissionService/CreateAdministrator",
            {"userId": user_id, "resource": {"organizationId": org_id}, "roles": ["ORG_USER_SELF_MANAGER"]},
        )
        if status == 200:
            granted += 1
            print(f"granted {name}")
        elif res.get("code") == "already_exists":
            skipped += 1
        else:
            failed += 1
            print(f"FAILED {name} ({user_id}): {status} {res.get('message', res)}", file=sys.stderr)
    if len(users) < page:
        break
    offset += page

print(f"done — granted {granted}, already members {skipped}, failed {failed}")
sys.exit(1 if failed else 0)
PY
