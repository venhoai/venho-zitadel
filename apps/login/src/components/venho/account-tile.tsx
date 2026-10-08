import { ChevronRightIcon } from "@heroicons/react/20/solid";

/**
 * VENHO FORK — the row the account picker's accounts and its "Add another
 * Account" share: Figma "_Select account item" (frame 1629:43388). A bordered
 * row with a trailing chevron, so it reads as a step forward without a
 * separate button. 17px vertical padding, not Figma's 18: Figma strokes the
 * border inside the 76px, CSS adds it outside.
 *
 * A plain module, not a client one: the accounts page (a server component)
 * uses these directly, and a constant exported from a "use client" file
 * reaches a server component as a client reference, not as its value.
 */
export const ACCOUNT_TILE_CLASSES =
  "group flex w-full flex-row items-center gap-4 rounded-lg border border-venho-light-border dark:border-venho-dark-border bg-background-light-500 dark:bg-background-dark-500 px-4 py-[17px] text-left transition-colors hover:bg-black/5 hover:dark:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-venho-light-muted focus-visible:dark:ring-venho-dark-muted";

export function AccountTileChevron() {
  return (
    <ChevronRightIcon
      aria-hidden
      className="text-venho-light-muted dark:text-venho-dark-muted group-hover:text-text-light-500 group-hover:dark:text-text-dark-500 size-4 shrink-0 transition-colors"
    />
  );
}
