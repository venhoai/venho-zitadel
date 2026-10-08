import classNames from "clsx";
import { DetailedHTMLProps, forwardRef, InputHTMLAttributes, useEffect, useState } from "react";

export type CheckboxProps = DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & {
  checked: boolean;
  disabled?: boolean;
  onChangeVal?: (checked: boolean) => void;
};

/**
 * VENHO FORK: the designs' shadcn checkbox (Figma "Checkbox", 1:550) — a 16px
 * box with a 4px radius, the input wash inside the input border, and when
 * ticked a white box with a dark tick. Still a native checkbox underneath
 * (`appearance-none`), so keyboard, form and label behaviour are the
 * browser's own.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className = "", checked = false, disabled = false, onChangeVal, children, ...props },
  ref,
) {
  const [enabled, setEnabled] = useState<boolean>(checked);

  useEffect(() => {
    setEnabled(checked);
  }, [checked]);

  return (
    <div className="relative flex items-start">
      <div className="relative flex size-4 shrink-0 items-center justify-center">
        <input
          ref={ref}
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target?.checked);
            if (onChangeVal) onChangeVal(event.target?.checked);
          }}
          disabled={disabled}
          type="checkbox"
          className={classNames(
            "peer size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border shadow-sm transition-colors outline-none",
            "border-input-light-border dark:border-input-dark-border bg-input-light-background dark:bg-input-dark-background",
            "checked:border-text-light-500 checked:bg-text-light-500 dark:checked:border-white dark:checked:bg-white",
            "focus-visible:ring-venho-light-focus dark:focus-visible:ring-venho-dark-focus focus-visible:ring-[3px]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute size-3.5 text-white opacity-0 peer-checked:opacity-100 dark:text-black"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      {children}
    </div>
  );
});
