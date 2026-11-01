export function otpLength(): number {
  const raw = import.meta.env['VITE_OTP_LENGTH'];
  const parsed = typeof raw === 'string' ? Number(raw) : 6;
  if (!Number.isInteger(parsed) || parsed < 6 || parsed > 10) return 6;
  return parsed;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}
