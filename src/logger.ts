import pino from 'pino';

const REDACTED = '[Redacted]';
const SENSITIVE_KEYS = new Set(['authorization', 'auth', 'authToken', 'content', 'token']);

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label })
  },
  redact: {
    paths: ['authorization', 'headers.authorization', 'req.headers.authorization'],
    censor: REDACTED
  }
});

export function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
      if (SENSITIVE_KEYS.has(key)) {
        return [key, REDACTED];
      }

      return [key, sanitizeForLog(nestedValue)];
    });

    return Object.fromEntries(entries);
  }

  return value;
}
