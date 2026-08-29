/**
 * VENHO FORK — resolve a file in `public/` to a URL the browser can fetch.
 *
 * Next only rewrites `basePath` into `next/image` and `next/link`; a plain
 * `<img src>` or a CSS `url()` is left alone, so a bare "/venho/logo.svg" 404s
 * whenever the app is mounted under a path — which ours always is
 * (/ui/v2/login). Upstream's `zitadel-logo.tsx` has exactly that bug.
 *
 * NEXT_PUBLIC_BASE_PATH is inlined at build time, so this works on the server
 * and in the browser without a round trip.
 */
export function assetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
