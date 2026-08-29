# Venho product copy

Strings in this directory are merged **last** — after the instance's hosted-login
translations — and are the only layer that can change wording ZITADEL already
ships.

That is not an optimisation. `getHostedLoginTranslation` returns a *complete*
copy of ZITADEL's default translations, not just an operator's overrides, and
upstream merges it at the highest priority. So a change to `locales/en.json` can
introduce a brand-new key, but it can never change an existing string: the
instance blob shadows it. Nearly every heading in the Venho designs is an
existing string.

See the comment in `src/i18n/request.ts` for the merge order.

## What belongs here

Only wording that is the product's own identity — the headings, descriptions and
button labels the designs specify.

Everything else should keep coming from `locales/<locale>.json`, so upstream's
translations and future copy fixes still reach us. A key claimed here is a key
that stops receiving them, in every language.

## Translations

`en.json` is applied under every locale, so an untranslated Venho string reads as
English rather than as a raw key. To translate, add `locales/venho/<locale>.json`
containing only the keys that have been translated.
