import { Translated } from "@/components/translated";
import {
  lowerCaseValidator,
  maxLengthValidator,
  numberValidator,
  symbolValidator,
  upperCaseValidator,
} from "@/helpers/validators";
import { PasswordComplexitySettings } from "@zitadel/proto/zitadel/settings/v2/password_settings_pb";
import { useTranslations } from "next-intl";
import { ReactNode } from "react";

type Props = {
  passwordComplexitySettings: PasswordComplexitySettings;
  password: string;
  equals: boolean;
};

/**
 * VENHO FORK: the designs' "Your password must have:" checklist (Figma
 * "Password requirements"). Every rule carries a 12px tick — muted while
 * unmet, green once met — rather than upstream's red cross / green tick at
 * 24px, so an empty form reads as a list of things to do, not of failures.
 *
 * Two columns in the designs' order: length, case and confirmation on the
 * left; the upper limit, number and symbol on the right. Rules the instance
 * does not require are left out; the confirmation and the upper limit always
 * apply.
 */
export function PasswordComplexity({ passwordComplexitySettings, password, equals }: Props) {
  const t = useTranslations("password");

  const left: ReactNode[] = [];
  const right: ReactNode[] = [];

  if (passwordComplexitySettings.minLength != undefined) {
    left.push(
      <Rule key="length" testId="length-check" met={password?.length >= passwordComplexitySettings.minLength} t={t}>
        <Translated
          i18nKey="complexity.length"
          namespace="password"
          data={{ minLength: passwordComplexitySettings.minLength.toString() }}
        />
      </Rule>,
    );
  }
  if (passwordComplexitySettings.requiresLowercase) {
    left.push(
      <Rule key="lowercase" testId="lowercase-check" met={lowerCaseValidator(password)} t={t}>
        <Translated i18nKey="complexity.hasLowercase" namespace="password" />
      </Rule>,
    );
  }
  if (passwordComplexitySettings.requiresUppercase) {
    left.push(
      <Rule key="uppercase" testId="uppercase-check" met={upperCaseValidator(password)} t={t}>
        <Translated i18nKey="complexity.hasUppercase" namespace="password" />
      </Rule>,
    );
  }
  left.push(
    <Rule key="equals" testId="equal-check" met={equals} t={t}>
      <Translated i18nKey="complexity.equals" namespace="password" />
    </Rule>,
  );

  right.push(
    <Rule key="max" testId="max-length-check" met={!!password && maxLengthValidator(password)} t={t}>
      <Translated i18nKey="complexity.maxLength" namespace="password" />
    </Rule>,
  );
  if (passwordComplexitySettings.requiresNumber) {
    right.push(
      <Rule key="number" testId="number-check" met={numberValidator(password)} t={t}>
        <Translated i18nKey="complexity.hasNumber" namespace="password" />
      </Rule>,
    );
  }
  if (passwordComplexitySettings.requiresSymbol) {
    right.push(
      <Rule key="symbol" testId="symbol-check" met={symbolValidator(password)} t={t}>
        <Translated i18nKey="complexity.hasSymbol" namespace="password" />
      </Rule>,
    );
  }

  return (
    <div className="flex w-full flex-col gap-2" data-testid="password-complexity">
      <p className="text-venho-light-secondary dark:text-venho-dark-secondary text-xs leading-4">
        <Translated i18nKey="complexity.title" namespace="password" />
      </p>
      <div className="flex w-full flex-row gap-10">
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">{left}</ul>
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">{right}</ul>
      </div>
    </div>
  );
}

function Rule({
  met,
  testId,
  t,
  children,
}: {
  met: boolean;
  testId: string;
  t: ReturnType<typeof useTranslations>;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-row items-center gap-2" data-testid={testId} data-met={met}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={
          met
            ? "text-venho-light-success dark:text-venho-dark-success size-3 flex-none"
            : "text-venho-light-muted dark:text-venho-dark-muted size-3 flex-none"
        }
        role="img"
      >
        <title>{met ? t("complexity.matches") : t("complexity.doesNotMatch")}</title>
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span
        className={
          met
            ? "text-text-light-500 dark:text-text-dark-500 text-xs leading-4 whitespace-nowrap"
            : "text-venho-light-muted dark:text-venho-dark-muted text-xs leading-4 whitespace-nowrap"
        }
      >
        {children}
      </span>
    </li>
  );
}
