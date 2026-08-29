"use client";

import { clsx } from "clsx";
import { ClipboardEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

/**
 * VENHO FORK — the segmented one-time-code field the designs use for email
 * verification and for the 2FA code. Upstream uses a single text input for both.
 *
 * One box per character, but only one value: the boxes are presentation, and the
 * component reports the whole string through `onChange`. The form still owns the
 * value, so validation and submit are unchanged.
 *
 * Behaviour that matters more than the visuals here, because this is the field
 * people fumble:
 *  - pasting a full code fills every box, wherever the caret is, and pasted text
 *    is stripped of separators so "123-456" works;
 *  - backspace in an empty box steps back and clears the previous one, which is
 *    what people expect when correcting a typo;
 *  - arrow keys move between boxes;
 *  - autocomplete="one-time-code" is on the first box, so iOS and Android offer
 *    the SMS/email code.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  error,
  disabled,
  autoFocus,
  label,
  "data-testid": testId,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  label: string;
  "data-testid"?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);

  const chars = useMemo(() => {
    const out = new Array<string>(length).fill("");
    for (let i = 0; i < Math.min(value.length, length); i++) {
      out[i] = value[i];
    }
    return out;
  }, [value, length]);

  useEffect(() => {
    if (autoFocus) {
      refs.current[0]?.focus();
    }
  }, [autoFocus]);

  const commit = (next: string[], focusIndex?: number) => {
    onChange(next.join("").slice(0, length));
    if (focusIndex !== undefined) {
      const clamped = Math.max(0, Math.min(length - 1, focusIndex));
      refs.current[clamped]?.focus();
      refs.current[clamped]?.select();
    }
  };

  const handleInput = (index: number, raw: string) => {
    // A box can receive more than one character: some keyboards autofill the
    // whole code into whichever box has focus.
    const cleaned = raw.replace(/\s|-/g, "");
    if (!cleaned) {
      const next = [...chars];
      next[index] = "";
      commit(next);
      return;
    }

    const next = [...chars];
    let cursor = index;
    for (const ch of cleaned) {
      if (cursor >= length) break;
      next[cursor] = ch;
      cursor++;
    }
    commit(next, cursor);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (chars[index]) {
        const next = [...chars];
        next[index] = "";
        commit(next);
      } else if (index > 0) {
        e.preventDefault();
        const next = [...chars];
        next[index - 1] = "";
        commit(next, index - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    handleInput(index, e.clipboardData.getData("text"));
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex flex-row justify-center gap-[8px]" role="group" aria-label={label}>
        {chars.map((char, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`${label} ${index + 1}`}
            value={char}
            disabled={disabled}
            onChange={(e) => handleInput(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(index, e)}
            onFocus={() => setFocused(index)}
            onBlur={() => setFocused((f) => (f === index ? null : f))}
            // The first box is "the field" as far as focus and tests are
            // concerned — it is what autoFocus lands on.
            data-testid={index === 0 ? testId : undefined}
            className={clsx(
              "h-[44px] w-[44px] rounded-md border text-center text-lg shadow-xs transition-colors",
              "bg-input-light-background dark:bg-input-dark-background text-black dark:text-white",
              "focus:outline-none focus:ring-0",
              error
                ? "border-warn-light-500 dark:border-warn-dark-500"
                : focused === index
                  ? "border-primary-light-500 dark:border-primary-dark-500"
                  : "border-input-light-border dark:border-input-dark-border",
              disabled && "pointer-events-none opacity-60",
            )}
          />
        ))}
      </div>
    </div>
  );
}
