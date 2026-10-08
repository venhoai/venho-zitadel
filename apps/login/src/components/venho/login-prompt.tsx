import Link from "next/link";
import { Translated } from "../translated";

/**
 * VENHO FORK — "Already have an account? Log in", under the Get started page.
 *
 * Muted prompt, then the link in the designs' secondary foreground at
 * semibold: a word in a sentence, not a button.
 */
export function LoginPrompt({ href }: { href: string }) {
  return (
    <div className="flex w-full flex-row items-baseline justify-center gap-1 text-sm leading-5">
      <span className="text-venho-light-muted dark:text-venho-dark-muted">
        <Translated i18nKey="loginPrompt" namespace="signup" />
      </span>
      <Link
        href={href}
        data-testid="login-link"
        className="text-venho-light-secondary dark:text-venho-dark-secondary hover:text-text-light-500 hover:dark:text-text-dark-500 font-semibold transition-colors"
      >
        <Translated i18nKey="login" namespace="signup" />
      </Link>
    </div>
  );
}
