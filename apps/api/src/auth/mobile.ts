// Mobile number handling. PROVISIONAL (FQ-1): only Indian mobile numbers are accepted, because
// the sign-in screen already says so. Supporting other countries means changing this one module;
// stored numbers are already E.164, so existing rows stay valid.

const SEPARATORS = /[\s\-().]/g;
// Indian mobile numbers: 10 digits starting 6–9.
const NATIONAL = /^[6-9]\d{9}$/;

/** Returns the number in E.164 form (+91XXXXXXXXXX), or undefined when it is not accepted. */
export function normaliseMobileNumber(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 32) {
    return undefined;
  }
  let digits = raw.trim().replace(SEPARATORS, '');
  if (digits.startsWith('+91')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0091')) {
    digits = digits.slice(4);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return NATIONAL.test(digits) ? `+91${digits}` : undefined;
}

/** For logs and screens: keeps the country code and the last 4 digits only. */
export function maskMobileNumber(e164: string): string {
  return `${e164.slice(0, 3)} ••••••${e164.slice(-4)}`;
}
