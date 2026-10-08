export function symbolValidator(value: string): boolean {
  const REGEXP = /[^a-zA-Z0-9]/gi;
  return REGEXP.test(value);
}

export function numberValidator(value: string): boolean {
  const REGEXP = /[0-9]/g;
  return REGEXP.test(value);
}

export function upperCaseValidator(value: string): boolean {
  const REGEXP = /[A-Z]/g;
  return REGEXP.test(value);
}

export function lowerCaseValidator(value: string): boolean {
  const REGEXP = /[a-z]/g;
  return REGEXP.test(value);
}

/**
 * VENHO FORK: the longest password the instance can actually store.
 *
 * ZITADEL hashes with bcrypt, which refuses more than 72 BYTES — not
 * characters — and the instance passes that through as a bare
 * "bcrypt: password length exceeds 72 bytes" (gRPC Unknown), after the user
 * has filled in the whole form. The designs state the rule as "fewer than 70
 * characters", which is what the user is told; the byte check underneath
 * keeps that promise true for passwords that are not plain ASCII.
 */
export const PASSWORD_MAX_CHARACTERS = 70;
export const PASSWORD_MAX_BYTES = 72;

export function maxLengthValidator(value: string): boolean {
  return Array.from(value).length < PASSWORD_MAX_CHARACTERS && new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES;
}
