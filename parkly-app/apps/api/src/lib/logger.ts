import pino, { type DestinationStream, type Logger } from 'pino';

export type { Logger };

export function maskPhone(phone: string): string {
  if (phone.length <= 7) return '*'.repeat(phone.length);
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 8)}${phone.slice(-4)}`;
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

// Doc 05 §logging: never log OTPs, tokens, passwords, bank/card numbers; mask phone/email.
const SECRET_KEYS = [
  'authorization',
  'cookie',
  'otp',
  'password',
  'token',
  'refreshToken',
  'accountNumber',
  'cardNumber',
];
const MASKED_KEYS = ['phone', 'email'];
const REDACT_PATHS = [...SECRET_KEYS, ...MASKED_KEYS].flatMap((k) => [k, `*.${k}`, `*.*.${k}`]);

function censor(value: unknown, path: string[]): unknown {
  const key = path[path.length - 1];
  if (typeof value === 'string' && key === 'phone') return maskPhone(value);
  if (typeof value === 'string' && key === 'email') return maskEmail(value);
  return '[REDACTED]';
}

export function createLogger(options: { level: string; stream?: DestinationStream }): Logger {
  return pino(
    {
      level: options.level,
      base: { service: 'parkly-api' },
      redact: { paths: REDACT_PATHS, censor },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    options.stream,
  );
}
