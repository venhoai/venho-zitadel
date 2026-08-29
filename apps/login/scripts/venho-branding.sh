#!/bin/sh
# Seed a ZITADEL instance's branding with the Venho palette.
#
# The login app reads these colours at runtime and derives the whole 50-900
# Tailwind scale from them, so this — not the code — is what actually paints the
# pages. `src/helpers/colors.ts` carries the same values as a fallback for when
# this call has not been made or the settings fetch fails; the two must agree.
#
# Idempotent: safe to re-run. Run it against every instance the login app fronts.
#
#   ZITADEL_API_URL=https://auth.dev.venho.ai \
#   ZITADEL_ADMIN_TOKEN=<pat> \
#     ./scripts/venho-branding.sh
#
# The token needs permission to write the instance label policy (an IAM owner
# PAT; the login client's own PAT is enough on a self-hosted instance).
# ZITADEL_API_DOMAIN overrides the Host header when the API is reached on an
# address that is not its external domain — as in the local compose stack, where
# the instance is `localhost` but the port is 8080.

set -e

API_URL="${ZITADEL_API_URL:?ZITADEL_API_URL is required}"
TOKEN="${ZITADEL_ADMIN_TOKEN:?ZITADEL_ADMIN_TOKEN is required}"
DOMAIN="${ZITADEL_API_DOMAIN:-}"

if [ -n "${DOMAIN}" ]; then
  HOST_HEADER="Host: ${DOMAIN}"
else
  HOST_HEADER="X-Venho-Noop: 1"
fi

# Dark is the designed theme — every screen in the Figma set is dark, and it is
# what the desktop app looks like. THEME_MODE_DARK rather than AUTO so a user
# whose OS is in light mode still gets the product's own look; they can still
# switch it themselves.
#
# Values are the desktop app's shipped tokens. See the comment block in
# src/helpers/colors.ts for the full mapping to the Figma variables.
PAYLOAD='{
  "primaryColor":        "#171717",
  "backgroundColor":     "#ffffff",
  "warnColor":           "#811d1d",
  "fontColor":           "#0a0a0a",
  "primaryColorDark":    "#e5e5e5",
  "backgroundColorDark": "#0c111d",
  "warnColorDark":       "#f87272",
  "fontColorDark":       "#f5f5f6",
  "themeMode":           "THEME_MODE_DARK",
  "hideLoginNameSuffix": true,
  "disableWatermark":    true
}'

echo "Seeding Venho branding on ${API_URL}"

curl -sS --fail-with-body -X PUT "${API_URL}/admin/v1/policies/label" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "${HOST_HEADER}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" > /dev/null

# A label policy only takes effect once activated — without this the write sits
# in the preview state and the login app keeps serving the previous colours.
curl -sS --fail-with-body -X POST "${API_URL}/admin/v1/policies/label/_activate" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "${HOST_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{}' > /dev/null

echo "Branding applied and activated."
