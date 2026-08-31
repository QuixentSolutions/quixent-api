import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema } from 'zod';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      (req as any)[source] = parsed;
      next();
    } catch (err) {
      next({ status: 400, message: 'Validation failed', error: 'VALIDATION_ERROR', details: (err as any).issues });
    }
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
