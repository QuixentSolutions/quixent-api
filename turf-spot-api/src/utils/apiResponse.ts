import { Response } from 'express';

export const sendSuccess = (res: Response, message: string, data?: unknown, status = 200): void => {
  res.status(status).json({ success: true, message, data });
};

export const sendError = (res: Response, message: string, error: string, status = 400): void => {
  res.status(status).json({ success: false, message, error });
};
