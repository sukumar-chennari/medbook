import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

// One place that turns every error into the same JSON shape:
//   { "error": { "code": "...", "message": "...", "details": [...] } }
// Express 5 sends errors from async handlers here automatically.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  // The input did not match the schema. Report which fields, never the values
  // (a value could be a password).
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  // A problem we threw on purpose (for example "email already taken").
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Broken JSON in the request body. The body parser marks this as a client mistake (400).
  if (err?.type === 'entity.parse.failed') {
    res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }

  // Anything else is our bug. Log it for us, but tell the client nothing about the inside.
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
