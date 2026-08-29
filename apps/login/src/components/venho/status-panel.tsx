import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

/**
 * VENHO FORK — a terminal state: a small bordered icon, a heading, and a line of
 * explanation. The designs use this shape for the end of a flow that has nowhere
 * left to go, where a form or an action button would be wrong.
 *
 * The icon sits in a 40px circle on the popover surface with the standard
 * border and shadow, not in a coloured success badge — the designs keep it
 * neutral and let the words carry the outcome.
 */
export function StatusPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-[20px]" data-testid="status-panel">
      <span className="border-divider-light dark:border-divider-dark bg-background-light-400 dark:bg-background-dark-400 flex size-[40px] items-center justify-center rounded-full border shadow-xs">
        <Icon className="text-text-light-500 dark:text-text-dark-500 size-[20px]" aria-hidden />
      </span>
      <div className="flex w-full flex-col items-center gap-[12px] text-center">
        <h1 className="font-display text-text-light-500 dark:text-text-dark-500 text-2xl leading-8 font-semibold">{title}</h1>
        <p className="text-text-light-secondary-500 dark:text-text-dark-secondary-500 max-w-[304px] text-sm leading-5">
          {description}
        </p>
      </div>
    </div>
  );
}
