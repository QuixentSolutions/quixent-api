import jwt from 'jsonwebtoken';

// Access token stays short-lived — clients keep it fresh with /auth/refresh.
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
// Refresh token TTL. Mobile clients want a session that lasts until the user
// explicitly logs out or deletes their account, so the default is effectively
// permanent; override with JWT_REFRESH_EXPIRY (e.g. '7d') where that's not wanted.
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '3650d';

export const generateAccessToken = (userId: string, mobile: string): string => {
  return jwt.sign(
    { userId, mobile },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: ACCESS_EXPIRY as jwt.SignOptions['expiresIn'] },
  );
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: REFRESH_EXPIRY as jwt.SignOptions['expiresIn'] },
  );
};
