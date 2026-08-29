"use client";

import { useRouter } from "next/navigation";
import { Button, ButtonVariants } from "./button";
import { Translated } from "./translated";

/**
 * VENHO FORK — the secondary action under a primary one.
 *
 * Upstream rendered a bordered Secondary button sitting at the opposite end of a
 * row from Submit. The designs stack the actions instead: a full-width primary,
 * and a full-width borderless one beneath it. Restyling here rather than at each
 * call site is what keeps the screens that have not been redrawn yet consistent
 * with the ones that have.
 */
export function BackButton() {
  const router = useRouter();
  return (
    <Button
      onClick={() => router.back()}
      type="button"
      variant={ButtonVariants.Ghost}
      className="h-[40px] w-full justify-center"
      data-testid="back-button"
    >
      <Translated i18nKey="back" namespace="common" />
    </Button>
  );
}
