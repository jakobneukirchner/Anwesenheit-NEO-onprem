import crypto from 'crypto';

/** Zeichen ohne leicht verwechselbare (O/0, I/1 zugelassen, wie in Beispielen). */
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Registrierungscode-Format: AA11-B2B2-C33C-44DD (4×4 alphanumerisch). */
export function generateRegistrationCode(): string {
  const group = (): string =>
    Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)]).join('');
  return `${group()}-${group()}-${group()}-${group()}`;
}

export const REGISTRATION_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function isValidRegistrationCodeFormat(code: string): boolean {
  return REGISTRATION_CODE_PATTERN.test(code);
}
