"use client";

import { getComponentRoundness } from "@/lib/theme";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import { ChangeEvent, DetailedHTMLProps, forwardRef, InputHTMLAttributes, ReactNode } from "react";

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
  onChange?: (value: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (value: ChangeEvent<HTMLInputElement>) => void;
  roundness?: string; // Allow override via props
};

const styles = (error: boolean, disabled: boolean, roundnessClasses: string = "rounded-md") =>
  clsx(
    {
      // VENHO FORK: 36px tall, 12px inset, 14px text and a subtle shadow, per
      // the designs' shadcn-derived field. Upstream was 40px with 7px padding
      // and 16px text, and italic placeholders.
      "h-[36px] mb-[2px] px-[12px] py-[4px] shadow-xs bg-input-light-background dark:bg-input-dark-background transition-colors duration-300 grow": true,
      "border border-input-light-border dark:border-input-dark-border hover:border-input-light-hoverborder hover:dark:border-input-dark-hoverborder focus:border-primary-light-500 focus:dark:border-primary-dark-500": true,
      "focus:outline-none focus:ring-0 text-sm leading-5 text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-600": true,
      "border border-warn-light-500 dark:border-warn-dark-500 hover:border-warn-light-500 hover:dark:border-warn-dark-500 focus:border-warn-light-500 focus:dark:border-warn-dark-500":
        error,
      "pointer-events-none text-gray-500 dark:text-gray-800 border border-input-light-border dark:border-input-dark-border hover:border-light-hoverborder hover:dark:border-hoverborder cursor-default":
        disabled,
    },
    roundnessClasses, // Apply the full roundness classes directly
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
      onChange,
      onBlur,
      roundness,
      ...props
    },
    ref,
  ) => {
    // Use theme-based roundness if not explicitly provided
    const actualRoundness = roundness || getDefaultInputRoundness();

    return (
      <label className="text-input-light-label dark:text-input-dark-label relative flex flex-col text-sm font-medium">
        <span className="mb-[8px] flex flex-row items-baseline justify-between gap-2 leading-none">
          <span className={error ? "text-warn-light-500 dark:text-warn-dark-500" : ""}>
            {label} {required && "*"}
          </span>
          {labelAction}
        </span>
        <input
          suppressHydrationWarning
          ref={ref}
          className={styles(!!error, !!disabled, actualRoundness)}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={props.autoComplete ?? "off"}
          onChange={(e) => onChange && onChange(e)}
          onBlur={(e) => onBlur && onBlur(e)}
          {...props}
        />

        {suffix && (
          <span
            className={clsx(
              "bg-background-light-500 dark:bg-background-dark-500 absolute right-[3px] bottom-[22px] z-30 translate-y-1/2 transform p-2",
              // Extract just the roundness part for the suffix (no padding)
              actualRoundness.split(" ")[0], // Take only the first part (rounded-full, rounded-md, etc.)
            )}
          >
            @{suffix}
          </span>
        )}

        <div className="leading-14.5px h-14.5px text-12px text-warn-light-500 dark:text-warn-dark-500 flex flex-row items-center">
          <span>{error ? error : " "}</span>
        </div>

        {success && (
          <div className="text-md mt-1 flex flex-row items-center text-green-500">
            <CheckCircleIcon className="h-4 w-4" />
            <span className="ml-1">{success}</span>
          </div>
        )}
      </label>
    );
  },
);
