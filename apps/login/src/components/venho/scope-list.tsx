import { toScopeRows } from "./scopes";
import { useTranslations } from "next-intl";

/**
 * VENHO FORK — the "you are about to grant X access to" list on the device
 * consent screen: an icon, a short label, and a sentence, separated by rules.
 *
 * Icons come from lucide-react (already a dependency) rather than the exported
 * SVGs: the designer drew these with lucide's own glyphs, so they are the same
 * artwork, and as components they take `currentColor` instead of the muted grey
 * baked into an export.
 */
export function ScopeList({ scopes, appName }: { scopes?: string[]; appName?: string }) {
  const t = useTranslations("device");
  const rows = toScopeRows(scopes);

  if (!rows.length) {
    return null;
  }

  return (
    <ul className="flex w-full flex-col" data-testid="scope-list">
      {rows.map(({ scope, icon: Icon, i18nKey }, index) => (
        <li key={scope} className="flex flex-col">
          {index > 0 && <div className="border-divider-light dark:border-divider-dark border-t" />}
          <div className="flex items-start gap-[16px] py-[10px]">
            <span className="flex size-[40px] shrink-0 items-center justify-center">
              <Icon className="text-text-light-secondary-500 dark:text-text-dark-secondary-500 size-[24px]" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col text-sm leading-5">
              <span className="text-text-light-500 dark:text-text-dark-500">
                {i18nKey ? t(`scopeTitle.${i18nKey}`) : t("scopeTitle.unknown")}
              </span>
              <span className="text-text-light-secondary-500 dark:text-text-dark-secondary-500 break-words">
                {i18nKey ? t(`scope.${i18nKey}`, { appName: appName ?? "" }) : scope}
              </span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
