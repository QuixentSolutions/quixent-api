import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/verifyToken';
import { sendSuccess, sendError } from '../utils/apiResponse';
import {
  sendOtpService,
  verifyOtpService,
  refreshTokenService,
  logoutService,
  getMeService,
  getUserByIdService,
  updateProfileService,
  uploadProfileImageService,
  deleteAccountService,
} from '../services/auth.service';

export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { mobile } = req.body;
    if (!mobile || !/^\d{10}$/.test(mobile)) {
      sendError(res, 'Valid 10-digit mobile number required', 'INVALID_PHONE', 400);
      return;
    }
    await sendOtpService(mobile);
    sendSuccess(res, 'OTP sent successfully', { mobile });
  } catch (err: any) {
    sendError(res, err.message ?? 'Failed to send OTP', err.error ?? 'SERVER_ERROR', err.status ?? 500);
  }
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { mobile, code } = req.body;
    if (!mobile || !code) {
      sendError(res, 'mobile and code are required', 'INVALID_INPUT', 400);
      return;
    }
    const result = await verifyOtpService(mobile, code);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 3650) * 24 * 60 * 60 * 1000,
    });
    sendSuccess(res, result.isNewUser ? 'Registered successfully' : 'Login successful', {
      isNewUser: result.isNewUser,
      profileComplete: !!result.user.name,
      accessToken: result.accessToken,
      token: result.accessToken,
      // Also returned in the body so native clients (no reliable cookie jar)
      // can persist it on-device and send it back to /auth/refresh.
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err: any) {
    sendError(res, err.message ?? 'Verification failed', err.error ?? 'SERVER_ERROR', err.status ?? 500);
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    // Accept the refresh token from any of: the httpOnly cookie (web), a
    // bearer header, or the JSON body (native clients that stored it locally).
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken || headerToken;
    if (!refreshToken) {
      sendError(res, 'Refresh token missing', 'REFRESH_INVALID', 401);
      return;
    }
    const result = await refreshTokenService(refreshToken);
    sendSuccess(res, 'Token refreshed', result);
  } catch (err: any) {
    sendError(res, err.message ?? 'Token refresh failed', err.error ?? 'SERVER_ERROR', err.status ?? 500);
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken || '';
    await logoutService(req.user!.userId, refreshToken);
    res.clearCookie('refreshToken');
    sendSuccess(res, 'Logged out successfully');
  } catch (err: any) {
    sendError(res, err.message ?? 'Logout failed', err.error ?? 'SERVER_ERROR', err.status ?? 500);
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await getMeService(req.user!.userId);
    sendSuccess(res, 'User fetched', { user });
  } catch (err: any) {
    sendError(res, err.message ?? 'Failed to fetch user', err.error ?? 'SERVER_ERROR', err.status ?? 500);
  }
};

export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await getUserByIdService(req.params.id);
    sendSuccess(res, 'User fetched', { user });
  } catch (err: any) {
    sendError(res, err.message ?? 'Failed to fetch user', err.error ?? 'SERVER_ERROR', err.status ?? 500);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, gender, age, city, bio, profileImage } = req.body;
    const user = await updateProfileService(req.user!.userId, { name, gender, age, city, bio, profileImage });
    sendSuccess(res, 'Profile updated', { user });
  } catch (err: any) {
    sendError(res, err.message ?? 'Failed to update profile', err.error ?? 'SERVER_ERROR', err.status ?? 500);
  }
};

export const uploadProfileImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { image, mimetype } = req.body;
    if (!image || !mimetype) {
      sendError(res, 'image (base64) and mimetype are required', 'INVALID_INPUT', 400);
      return;
    }
    const result = await uploadProfileImageService(req.user!.userId, image, mimetype);
    sendSuccess(res, 'Profile image uploaded', result);
  } catch (err: any) {
    sendError(res, err.message ?? 'Failed to upload image', err.error ?? 'SERVER_ERROR', err.status ?? 500);
  }
};

export const deleteAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await deleteAccountService(req.user!.userId);
    res.clearCookie('refreshToken');
    sendSuccess(res, 'Account deleted successfully');
  } catch (err: any) {
    sendError(res, err.message ?? 'Failed to delete account', err.error ?? 'SERVER_ERROR', err.status ?? 500);
  }
};
