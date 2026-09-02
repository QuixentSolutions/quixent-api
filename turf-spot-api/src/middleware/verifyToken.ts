import { Request, Response, NextFunction } from 'express';
import axios from 'axios';

// Same approach as match-calculator-api: this module doesn't verify JWTs
// itself, it asks the shared auth service who the caller is.
export interface AuthUser {
  userId: string;
  mobile: string;
  name: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const verifyToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided', error: 'TOKEN_MISSING' });
    return;
  }

  try {
    const response = await axios.get(`${process.env.AUTH_API_URL}/auth/me`, {
      headers: { Authorization: header },
      timeout: 5000,
    });
    const u = response.data.data.user;
    req.user = { userId: u._id, mobile: u.mobile, name: u.name, role: u.role };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token', error: 'TOKEN_INVALID' });
  }
};
