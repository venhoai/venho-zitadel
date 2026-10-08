import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, test } from "vitest";
import { PasswordComplexity } from "./password-complexity";

describe("<PasswordComplexity/>", () => {
  const messages = {
    password: {
      complexity: {
        length: "Must be at least {minLength} characters long.",
        hasSymbol: "Must include a symbol.",
        hasNumber: "Must include a number.",
        hasUppercase: "Must include an uppercase letter.",
        hasLowercase: "Must include a lowercase letter.",
        equals: "Password confirmation matched.",
        matches: "Matches",
        doesNotMatch: "Doesn't match",
        title: "Your password must have:",
        maxLength: "Password < 70 chars",
      },
    },
  };

  afterEach(cleanup);

  test("should render length check when minLength is defined", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="Password1!"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(5),
              requiresLowercase: false,
              requiresUppercase: false,
              requiresNumber: false,
              requiresSymbol: false,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    const lengthCheck = screen.getByTestId("length-check");
    expect(lengthCheck).toBeInTheDocument();
    expect(lengthCheck.querySelector("svg")).toBeInTheDocument();
  });

  test("should not render length check when minLength is undefined", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="Password1!"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(0),
              requiresLowercase: false,
              requiresUppercase: false,
              requiresNumber: false,
              requiresSymbol: false,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByTestId("length-check")).toBeInTheDocument();
  });

  test("a met rule shows the success tick", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="Password1!"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(5),
              requiresLowercase: false,
              requiresUppercase: false,
              requiresNumber: false,
              requiresSymbol: false,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    const lengthCheck = screen.getByTestId("length-check");
    expect(lengthCheck).toHaveAttribute("data-met", "true");
    expect(lengthCheck.querySelector("svg")).toHaveClass("dark:text-venho-dark-success");
  });

  test("an unmet rule shows a muted tick, not a cross", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="Pass"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(10),
              requiresLowercase: false,
              requiresUppercase: false,
              requiresNumber: false,
              requiresSymbol: false,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    const lengthCheck = screen.getByTestId("length-check");
    expect(lengthCheck).toHaveAttribute("data-met", "false");
    expect(lengthCheck.querySelector("svg")).toHaveClass("dark:text-venho-dark-muted");
  });

  test("should render all complexity checks when all requirements are enabled", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="Password1!"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(8),
              requiresLowercase: true,
              requiresUppercase: true,
              requiresNumber: true,
              requiresSymbol: true,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId("length-check")).toBeInTheDocument();
    expect(screen.getByTestId("symbol-check")).toBeInTheDocument();
    expect(screen.getByTestId("number-check")).toBeInTheDocument();
    expect(screen.getByTestId("uppercase-check")).toBeInTheDocument();
    expect(screen.getByTestId("lowercase-check")).toBeInTheDocument();
    expect(screen.getByTestId("equal-check")).toBeInTheDocument();
  });

  test("should not render symbol check when requiresSymbol is false", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="Password1!"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(8),
              requiresLowercase: true,
              requiresUppercase: true,
              requiresNumber: true,
              requiresSymbol: false,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByTestId("symbol-check")).not.toBeInTheDocument();
    expect(screen.getByTestId("number-check")).toBeInTheDocument();
    expect(screen.getByTestId("uppercase-check")).toBeInTheDocument();
    expect(screen.getByTestId("lowercase-check")).toBeInTheDocument();
  });

  test("should not render number check when requiresNumber is false", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="Password1!"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(8),
              requiresLowercase: true,
              requiresUppercase: true,
              requiresNumber: false,
              requiresSymbol: true,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId("symbol-check")).toBeInTheDocument();
    expect(screen.queryByTestId("number-check")).not.toBeInTheDocument();
    expect(screen.getByTestId("uppercase-check")).toBeInTheDocument();
    expect(screen.getByTestId("lowercase-check")).toBeInTheDocument();
  });

  test("should not render uppercase check when requiresUppercase is false", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="Password1!"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(8),
              requiresLowercase: true,
              requiresUppercase: false,
              requiresNumber: true,
              requiresSymbol: true,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId("symbol-check")).toBeInTheDocument();
    expect(screen.getByTestId("number-check")).toBeInTheDocument();
    expect(screen.queryByTestId("uppercase-check")).not.toBeInTheDocument();
    expect(screen.getByTestId("lowercase-check")).toBeInTheDocument();
  });

  test("should not render lowercase check when requiresLowercase is false", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="Password1!"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(8),
              requiresLowercase: false,
              requiresUppercase: true,
              requiresNumber: true,
              requiresSymbol: true,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId("symbol-check")).toBeInTheDocument();
    expect(screen.getByTestId("number-check")).toBeInTheDocument();
    expect(screen.getByTestId("uppercase-check")).toBeInTheDocument();
    expect(screen.queryByTestId("lowercase-check")).not.toBeInTheDocument();
  });

  test("should only render length and equals checks when all other requirements are disabled", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordComplexity
          password="password"
          equals
          passwordComplexitySettings={
            {
              minLength: BigInt(8),
              requiresLowercase: false,
              requiresUppercase: false,
              requiresNumber: false,
              requiresSymbol: false,
              resourceOwnerType: 0,
            } as any
          }
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId("length-check")).toBeInTheDocument();
    expect(screen.getByTestId("equal-check")).toBeInTheDocument();
    expect(screen.queryByTestId("symbol-check")).not.toBeInTheDocument();
    expect(screen.queryByTestId("number-check")).not.toBeInTheDocument();
    expect(screen.queryByTestId("uppercase-check")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lowercase-check")).not.toBeInTheDocument();
  });

  test("the upper limit counts characters and the 72 bytes bcrypt can store", () => {
    const settings = {
      minLength: BigInt(1),
      requiresLowercase: false,
      requiresUppercase: false,
      requiresNumber: false,
      requiresSymbol: false,
      resourceOwnerType: 0,
    } as any;
    const met = (password: string) => {
      cleanup();
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <PasswordComplexity password={password} equals passwordComplexitySettings={settings} />
        </NextIntlClientProvider>,
      );
      return screen.getByTestId("max-length-check").getAttribute("data-met");
    };

    expect(met("a".repeat(69))).toBe("true");
    expect(met("a".repeat(70))).toBe("false");
    // 37 two-byte characters: under 70 characters, but 74 bytes.
    expect(met("é".repeat(37))).toBe("false");
    expect(met("")).toBe("false");
  });
});
