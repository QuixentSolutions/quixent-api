import { Request, Response, NextFunction } from 'express';

const WINDOW_MS    = 15 * 60 * 1000;
const MAX_REQUESTS = process.env.NODE_ENV === 'development' ? 20 : 3;

const store = new Map<string, { count: number; resetAt: number }>();

// Same normalization as sms.service.ts's formatPhone — strips a leading +91
// (if present) and keeps the last 10 digits, so "9876543210", "+919876543210"
// and "919876543210" all key to the same bucket.
const normalizePhone = (mobile: string): string => mobile.replace(/^\+?91/, '').trim().slice(-10);

export const otpRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile : undefined;
  // Keyed by the target phone number, not the caller's IP — this limits how
  // often any one phone can be sent OTPs (the actual abuse case: spamming a
  // victim's number), rather than blocking a whole network/NAT after a
  // handful of legitimate requests to *different* numbers.
  const key = mobile ? `phone:${normalizePhone(mobile)}` : `ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryAfterSecs = Math.ceil((entry.resetAt - now) / 1000);
    res.status(429).json({
      success: false,
      message: `Too many OTP requests. Try again in ${retryAfterSecs} seconds.`,
      error: 'RATE_LIMIT_EXCEEDED',
    });
    return;
  }

  entry.count += 1;
  next();
};
