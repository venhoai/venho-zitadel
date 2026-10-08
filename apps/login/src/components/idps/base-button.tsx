"use client";

import { getComponentRoundness } from "@/lib/theme";
import { clsx } from "clsx";
import { Loader2Icon } from "lucide-react";
import { ButtonHTMLAttributes, DetailedHTMLProps, forwardRef } from "react";
import { useFormStatus } from "react-dom";

export type SignInWithIdentityProviderProps = DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> & {
  name?: string;
  e2e?: string;
};

export const BaseButton = forwardRef<HTMLButtonElement, SignInWithIdentityProviderProps>(function BaseButton(props, ref) {
  const formStatus = useFormStatus();
  const buttonRoundness = getComponentRoundness("button");

  return (
    <button
      {...props}
      type="submit"
      ref={ref}
      disabled={formStatus.pending}
      className={clsx(
        // VENHO FORK: the designs' outline button — 36px, a faint white wash
        // inside the input border, 16px mark and a medium label centred.
        // Upstream left the content flush left at whatever height the icon
        // happened to impose.
        `text-text-light-500 dark:text-text-dark-500 flex h-9 flex-1 cursor-pointer flex-row items-center px-4 text-sm font-medium shadow-xs transition-colors outline-none`,
        `border-input-light-border dark:border-input-dark-border bg-input-light-background dark:bg-input-dark-background border`,
        `focus-visible:border-input-light-hoverborder focus-visible:dark:border-input-dark-hoverborder hover:bg-black/5 hover:dark:bg-white/10`,
        buttonRoundness,
        props.className,
      )}
    >
      <div className="flex flex-1 items-center justify-center gap-2">
        <div className="flex flex-row items-center gap-2">{props.children}</div>
        {formStatus.pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
      </div>
    </button>
  );
});
