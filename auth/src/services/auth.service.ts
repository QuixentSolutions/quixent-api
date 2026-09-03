import jwt from 'jsonwebtoken';
import axios from 'axios';
import User from '../models/User';
import Otp from '../models/Otp';
import OtpRateLimit from '../models/OtpRateLimit';
import Token from '../models/Token';
import { generateOtp } from '../utils/generateOtp';
import { generateAccessToken, generateRefreshToken } from '../utils/generateTokens';
import { RefreshTokenPayload } from '../types';
import { sendOtpSms } from './sms.service';
import { uploadToS3 } from '../config/s3.config';

const OTP_EXPIRY_MS        = 5 * 60 * 1000;
const OTP_COOLDOWN_MS      = 60 * 1000;
const MAX_DAILY_REQUESTS   = 10;
const MAX_ATTEMPTS         = 5;
const RATE_LIMIT_EXPIRY_MS = 24 * 60 * 60 * 1000;
// The stored refresh-token row carries a TTL index, so it must outlive the
// refresh JWT itself or Mongo reaps it early and ends the session. Default
// ~10 years ("until logout / account delete"); override with REFRESH_TOKEN_TTL_DAYS.
const REFRESH_TOKEN_TTL_MS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 3650) * 24 * 60 * 60 * 1000;

// Play Store review accounts — set REVIEW_PHONES and REVIEW_OTP in .env on the server
const REVIEW_PHONES = process.env.REVIEW_PHONES?.split(',').map(p => p.trim()) ?? [];
const REVIEW_OTP    = process.env.REVIEW_OTP ?? '123456';

export const sendOtpService = async (mobile: string) => {
  const isReview = REVIEW_PHONES.includes(mobile);

  if (!isReview) {
    const rateLimit = await OtpRateLimit.findOne({ mobile });

    if (rateLimit) {
      const secsSinceLast = (Date.now() - rateLimit.lastRequestAt.getTime()) / 1000;

      if (secsSinceLast < OTP_COOLDOWN_MS / 1000) {
        const waitSecs = Math.ceil(OTP_COOLDOWN_MS / 1000 - secsSinceLast);
        throw { status: 429, message: `Please wait ${waitSecs} second${waitSecs !== 1 ? 's' : ''} before requesting another OTP`, error: 'OTP_RESEND_LIMIT' };
      }

      if (rateLimit.dailyRequestCount >= MAX_DAILY_REQUESTS) {
        throw { status: 429, message: `Daily OTP limit reached. Try again tomorrow.`, error: 'OTP_RESEND_LIMIT' };
      }
    }
  }

  const code = isReview ? REVIEW_OTP : generateOtp();
  const now = new Date();
  const expiresAt = isReview
    ? new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + OTP_EXPIRY_MS);

  await Otp.findOneAndUpdate(
    { mobile },
    { mobile, code, attempts: 0, expiresAt },
    { upsert: true, new: true },
  );

  if (!isReview) {
    await OtpRateLimit.findOneAndUpdate(
      { mobile },
      {
        $set: { mobile, lastRequestAt: now, expiresAt: new Date(now.getTime() + RATE_LIMIT_EXPIRY_MS) },
        $inc: { dailyRequestCount: 1 },
      },
      { upsert: true, new: true },
    );

    await sendOtpSms(mobile, code);
  }
};

export const verifyOtpService = async (mobile: string, code: string) => {
  const isReview = REVIEW_PHONES.includes(mobile);
  const otp = await Otp.findOne({ mobile });

  if (!otp) {
    throw { status: 400, message: 'OTP not found or expired. Please request a new OTP.', error: 'OTP_INVALID' };
  }

  if (!isReview && Date.now() > otp.expiresAt.getTime()) {
    await Otp.deleteOne({ mobile });
    throw { status: 400, message: 'OTP expired. Please request a new OTP.', error: 'OTP_INVALID' };
  }

  if (!isReview && otp.attempts >= MAX_ATTEMPTS) {
    await Otp.deleteOne({ mobile });
    throw { status: 400, message: 'Too many failed attempts. Please request a new OTP.', error: 'OTP_MAX_ATTEMPTS' };
  }

  if (otp.code !== String(code).trim()) {
    otp.attempts += 1;
    await otp.save();
    const remaining = MAX_ATTEMPTS - otp.attempts;
    throw { status: 400, message: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`, error: 'OTP_INVALID' };
  }

  if (isReview) {
    // Keep OTP alive and reusable for Play Store reviewers
    otp.attempts = 0;
    await otp.save();
  } else {
    await Otp.deleteOne({ mobile });
  }

  let user = await User.findOne({ mobile });
  const isNewUser = !user;

  if (!user) {
    user = await User.create({ mobile });
  } else {
    user.lastLogin = new Date();
    await user.save();
  }

  if (!user.isActive) {
    throw { status: 403, message: 'Account is deactivated.', error: 'USER_INACTIVE' };
  }

  const accessToken = generateAccessToken(user._id.toString(), user.mobile);
  const refreshToken = generateRefreshToken(user._id.toString());

  await Token.create({
    userId: user._id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return {
    isNewUser,
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      mobile: user.mobile,
      name: user.name,
      gender: user.gender,
      age: user.age,
      role: user.role,
      profileImage: user.profileImage,
    },
  };
};

export const refreshTokenService = async (refreshToken: string) => {
  const tokenDoc = await Token.findOne({ token: refreshToken });
  if (!tokenDoc) {
    throw { status: 401, message: 'Invalid or expired refresh token.', error: 'REFRESH_INVALID' };
  }

  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as RefreshTokenPayload;
  } catch {
    await Token.deleteOne({ token: refreshToken });
    throw { status: 401, message: 'Refresh token expired. Please login again.', error: 'REFRESH_INVALID' };
  }

  const user = await User.findById(payload.userId);
  if (!user || !user.isActive) {
    throw { status: 403, message: 'User not found or inactive.', error: 'USER_INACTIVE' };
  }

  const newAccessToken = generateAccessToken(user._id.toString(), user.mobile);
  return { accessToken: newAccessToken };
};

export const logoutService = async (userId: string, refreshToken: string) => {
  await Token.deleteOne({ userId, token: refreshToken });
};

export const getMeService = async (userId: string) => {
  const user = await User.findById(userId).select('-__v');
  if (!user) {
    throw { status: 404, message: 'User not found.', error: 'USER_NOT_FOUND' };
  }
  return user;
};

export const getUserByIdService = async (userId: string) => {
  const user = await User.findById(userId).select('name gender age city profileImage');
  if (!user) {
    throw { status: 404, message: 'User not found.', error: 'USER_NOT_FOUND' };
  }
  return user;
};

export const updateProfileService = async (
  userId: string,
  data: { name?: string; gender?: string; age?: number; city?: string; bio?: string; profileImage?: string },
) => {
  if (data.gender && !['male', 'female'].includes(data.gender)) {
    throw { status: 400, message: 'gender must be male or female.', error: 'INVALID_INPUT' };
  }
  if (data.age !== undefined && (data.age < 18 || data.age > 80)) {
    throw { status: 400, message: 'age must be between 18 and 80.', error: 'INVALID_INPUT' };
  }

  const user = await User.findByIdAndUpdate(userId, data, { new: true }).select('-__v');
  if (!user) {
    throw { status: 404, message: 'User not found.', error: 'USER_NOT_FOUND' };
  }
  return user;
};

export const uploadProfileImageService = async (
  userId: string,
  base64: string,
  mimetype: string,
) => {
  const imageUrl = await uploadToS3(base64, mimetype, 'Profile-images');
  const user = await User.findByIdAndUpdate(
    userId,
    { profileImage: imageUrl },
    { new: true },
  ).select('-__v');
  if (!user) throw { status: 404, message: 'User not found.', error: 'USER_NOT_FOUND' };
  return { profileImage: imageUrl, user };
};

export const deleteAccountService = async (userId: string) => {
  const user = await User.findById(userId);
  if (user) {
    await Otp.deleteMany({ mobile: user.mobile });
    await OtpRateLimit.deleteMany({ mobile: user.mobile });
  }
  await Token.deleteMany({ userId });
  await User.findByIdAndDelete(userId);

  // Fire-and-forget: clean up match data on the match service
  try {
    await axios.delete(`${process.env.AUTH_API_URL?.replace('/auth', '')}/match/user-data`, {
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET ?? '' },
      data: { userId },
      timeout: 5000,
    });
  } catch {
    // non-critical — orphaned match data does not contain PII
  }

  // Fire-and-forget: clean up Thallu Vandi stalls/reviews owned by this user
  try {
    await axios.delete(`${process.env.AUTH_API_URL?.replace('/auth', '')}/streeteats/user-data`, {
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET ?? '' },
      data: { userId },
      timeout: 5000,
    });
  } catch {
    // non-critical — orphaned stall/review data does not contain PII beyond what's already public
  }

  // Fire-and-forget: clean up Turf listings/bookings/reviews owned by this user
  try {
    await axios.delete(`${process.env.AUTH_API_URL?.replace('/auth', '')}/turf/user-data`, {
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET ?? '' },
      data: { userId },
      timeout: 5000,
    });
  } catch {
    // non-critical — orphaned turf data does not contain PII beyond what's already public
  }
};
