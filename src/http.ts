import { NextFunction, Request, Response } from 'express';

import { logger, sanitizeForLog } from './logger.js';

export class HttpError extends Error {
  readonly statusCode: number;
  readonly expose: boolean;

  constructor(statusCode: number, message: string, options?: { expose?: boolean }) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.expose = options?.expose ?? statusCode < 500;
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);
    logger.info(
      {
        req: {
          method: req.method,
          path: req.originalUrl
        },
        res: {
          statusCode: res.statusCode
        },
        durationMs
      },
      'HTTP request completed'
    );
  });

  next();
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const httpError = normalizeHttpError(err);

  logger.error(
    {
      err: err instanceof Error ? err : new Error(String(err)),
      req: {
        method: req.method,
        path: req.originalUrl,
        query: sanitizeForLog(req.query)
      },
      body: sanitizeForLog(req.body)
    },
    'HTTP request failed'
  );

  if (res.headersSent) {
    return;
  }

  res.status(httpError.statusCode).json({
    error: httpError.expose ? httpError.message : 'Internal Server Error'
  });
}

function normalizeHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) {
    return err;
  }

  if (err instanceof Error) {
    const maybeStatusCode = Reflect.get(err, 'statusCode') ?? Reflect.get(err, 'status');
    const statusCode = typeof maybeStatusCode === 'number' ? maybeStatusCode : 500;

    return new HttpError(statusCode, statusCode < 500 ? err.message : 'Internal Server Error');
  }

  return new HttpError(500, 'Internal Server Error');
}
