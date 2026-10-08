"use client";

import { getComponentRoundness } from "@/lib/theme";
import { ExclamationCircleIcon } from "@heroicons/react/20/solid";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { ChangeEvent, DetailedHTMLProps, forwardRef, InputHTMLAttributes, ReactNode, useId, useState } from "react";

export type TextInputProps = DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & {
  label: string;
  suffix?: string;
  placeholder?: string;
  defaultValue?: string;
  error?: string | ReactNode;
  success?: string | ReactNode;
  disabled?: boolean;
  /**
   * VENHO FORK: content pinned to the right of the label row — the designs put
   * "Forgot your password?" there rather than under the field, so the escape
   * hatch reads as part of the field it belongs to.
   */
  labelAction?: ReactNode;
  /** Accessible names for a password field's show/hide toggle. */
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
  onChange?: (value: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (value: ChangeEvent<HTMLInputElement>) => void;
  roundness?: string; // Allow override via props
};

/**
 * VENHO FORK: the designs' shadcn input (Figma "Input", 1:1593). 36px tall,
 * 12px inset, 14px text, the faint white wash inside the input border, and a
 * shadow-xs. Focus is a lighter border with a 3px halo; an error is the
 * destructive border with an alert mark inside the field and the message
 * under it, in muted text — the red border carries the state, the words stay
 * readable. Upstream was 40px with 7px padding, italic placeholders, red
 * error text and a blank line reserved under every field whether or not it
 * had anything to say.
 */
const styles = (error: boolean, disabled: boolean, trailing: number, roundnessClasses: string = "rounded-md") =>
  clsx(
    "h-9 w-full min-w-0 grow px-3 py-1 text-sm leading-5 shadow-xs border outline-none transition-[color,border-color,box-shadow] duration-200",
    "bg-input-light-background dark:bg-input-dark-background text-text-light-500 dark:text-text-dark-500",
    "placeholder:text-venho-light-muted dark:placeholder:text-venho-dark-muted",
    "focus-visible:ring-[3px]",
    error
      ? "border-venho-light-destructive dark:border-venho-dark-destructive focus-visible:ring-venho-light-destructive/20 dark:focus-visible:ring-venho-dark-destructive/20"
      : "border-input-light-border dark:border-input-dark-border focus-visible:border-venho-light-ring dark:focus-visible:border-venho-dark-ring focus-visible:ring-venho-light-focus dark:focus-visible:ring-venho-dark-focus",
    // Room for the marks pinned inside the right edge: 16px each, 4px apart.
    trailing === 1 && "pr-9",
    trailing === 2 && "pr-14",
    disabled && "pointer-events-none cursor-default opacity-50",
    roundnessClasses,
  );

// Helper function to get default input roundness from theme
function getDefaultInputRoundness(): string {
  return getComponentRoundness("input");
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      label,
      placeholder,
      defaultValue,
      suffix,
      required = false,
      error,
      disabled,
      success,
      labelAction,
      showPasswordLabel = "Show password",
      hidePasswordLabel = "Hide password",
      onChange,
      onBlur,
      roundness,
      id,
      type,
      ...props
    },
    ref,
  ) => {
    // Use theme-based roundness if not explicitly provided
    const actualRoundness = roundness || getDefaultInputRoundness();
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const messageId = `${inputId}-message`;

    const isPassword = type === "password";
    const [revealed, setRevealed] = useState(false);
    const trailing = (error ? 1 : 0) + (isPassword ? 1 : 0);

    return (
      <div className="relative flex flex-col gap-2 text-sm">
        <div className="flex flex-row items-baseline justify-between gap-2">
          <label htmlFor={inputId} className="text-input-light-label dark:text-input-dark-label leading-none font-medium">
            {label}
          </label>
          {labelAction}
        </div>

        <div className="relative flex items-center">
          <input
            suppressHydrationWarning
            ref={ref}
            id={inputId}
            type={isPassword && revealed ? "text" : type}
            className={styles(!!error, !!disabled, trailing, actualRoundness)}
            defaultValue={defaultValue}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? messageId : undefined}
            autoComplete={props.autoComplete ?? "off"}
            onChange={(e) => onChange && onChange(e)}
            onBlur={(e) => onBlur && onBlur(e)}
            {...props}
          />

          {trailing > 0 && (
            <span className="absolute right-3 flex items-center gap-1">
              {error && (
                <ExclamationCircleIcon
                  aria-hidden
                  className="text-venho-light-destructive dark:text-venho-dark-destructive size-4"
                />
              )}
              {isPassword && (
                <button
                  type="button"
                  onClick={() => setRevealed((r) => !r)}
                  aria-label={revealed ? hidePasswordLabel : showPasswordLabel}
                  aria-pressed={revealed}
                  aria-controls={inputId}
                  disabled={disabled}
                  data-testid="password-visibility-toggle"
                  className="text-venho-light-muted dark:text-venho-dark-muted hover:text-text-light-500 hover:dark:text-text-dark-500 focus-visible:text-text-light-500 focus-visible:dark:text-text-dark-500 flex size-4 cursor-pointer items-center justify-center rounded-sm outline-none"
                >
                  {/* Drawn as the designs draw it: eye-off while the
                      password is hidden, eye while it shows. */}
                  {revealed ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
                </button>
              )}
            </span>
          )}

          {suffix && (
            <span
              className={clsx(
                "bg-background-light-500 dark:bg-background-dark-500 absolute top-1/2 right-[3px] z-30 -translate-y-1/2 transform p-2",
                // Extract just the roundness part for the suffix (no padding)
                actualRoundness.split(" ")[0], // Take only the first part (rounded-full, rounded-md, etc.)
              )}
            >
              @{suffix}
            </span>
          )}
        </div>

        {error && (
          <p
            id={messageId}
            className="text-venho-light-muted dark:text-venho-dark-muted leading-5"
            data-testid="field-error"
          >
            {error}
          </p>
        )}

        {success && (
          <div className="flex flex-row items-center text-green-500">
            <CheckCircleIcon className="h-4 w-4" />
            <span className="ml-1">{success}</span>
          </div>
        )}
      </div>
    );
  },
);
