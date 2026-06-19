import mongoose from 'mongoose';
import axios from 'axios';
import Match from '../models/Match';
import Answer from '../models/Answer';
import ConnectCode from '../models/ConnectCode';
import Question from '../models/Question';
import Message from '../models/Message';
import PushToken from '../models/PushToken';
import { sendPushNotification } from '../utils/notifications';
import { ScoreResult, ActiveMatch, ChatMessage } from '../types';

async function fetchUserProfile(userId: string, token: string) {
  try {
    const res = await axios.get(`${process.env.AUTH_API_URL}/auth/user/${userId}`, {
      headers: { Authorization: token },
      timeout: 3000,
    });
    return res.data?.data?.user ?? null;
  } catch {
    return null;
  }
}

const CODE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const generateConnectCodeService = async (userId: string) => {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  const connectCode = await ConnectCode.findOneAndUpdate(
    { userId },
    { userId, code, expiresAt },
    { upsert: true, new: true },
  );
  return connectCode;
};

export const getMyConnectCodeService = async (userId: string) => {
  const connectCode = await ConnectCode.findOne({ userId });
  if (!connectCode) {
    throw { status: 404, message: 'No connect code found. Generate one first.', error: 'CODE_NOT_FOUND' };
  }
  return connectCode;
};

export const deleteUserDataService = async (userId: string) => {
  const matches = await Match.find({ $or: [{ senderId: userId }, { receiverId: userId }] });
  const matchIds = matches.map((m) => m._id);
  await Answer.deleteMany({ userId });
  await Message.deleteMany({ senderId: userId });
  await Answer.deleteMany({ matchId: { $in: matchIds } });
  await Message.deleteMany({ matchId: { $in: matchIds } });
  await Match.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] });
  await ConnectCode.deleteMany({ userId });
  await PushToken.deleteOne({ userId });
};

export const savePushTokenService = async (userId: string, token: string) => {
  await PushToken.findOneAndUpdate(
    { userId },
    { userId, token },
    { upsert: true, new: true },
  );
};

export const sendMatchRequestService = async (senderId: string, code: string) => {
  const connectCode = await ConnectCode.findOne({ code });
  if (!connectCode) {
    throw { status: 404, message: 'Invalid or expired connect code.', error: 'INVALID_CODE' };
  }

  const receiverId = connectCode.userId;

  if (receiverId === senderId) {
    throw { status: 400, message: 'You cannot match with yourself.', error: 'INVALID_REQUEST' };
  }

  const existing = await Match.findOne({
    $or: [
      { senderId, receiverId },
      { senderId: receiverId, receiverId: senderId },
    ],
  });

  if (existing) {
    throw { status: 409, message: 'Match request already exists.', error: 'MATCH_EXISTS' };
  }

  const match = await Match.create({ senderId, receiverId, status: 'accepted' });
  sendPushNotification(receiverId, 'New Match!', 'Someone connected with you on Ansora 💑');
  return match;
};

export const getMyMatchesService = async (userId: string, token: string): Promise<ActiveMatch[]> => {
  const [matches, questions] = await Promise.all([
    Match.find({ $or: [{ senderId: userId }, { receiverId: userId }] }).sort({ createdAt: -1 }),
    Question.find(),
  ]);
  const totalQuestions = questions.length;

  const partnerIds = [...new Set(matches.map((m) => m.senderId === userId ? m.receiverId : m.senderId))];
  const partnerProfiles = await Promise.all(partnerIds.map((id) => fetchUserProfile(id, token)));
  const profileMap = new Map(partnerIds.map((id, i) => [id, partnerProfiles[i]]));

  return Promise.all(
    matches.map(async (match) => {
      const matchObjId = match._id as mongoose.Types.ObjectId;
      const partnerId = match.senderId === userId ? match.receiverId : match.senderId;
      const profile = profileMap.get(partnerId);

      const [myAnswers, partnerAnswers, messageCount] = await Promise.all([
        Answer.countDocuments({ matchId: matchObjId, userId }),
        Answer.countDocuments({ matchId: matchObjId, userId: partnerId }),
        Message.countDocuments({ matchId: matchObjId }),
      ]);

      return {
        matchId: matchObjId.toString(),
        status: match.status,
        partner: profile ? { name: profile.name, gender: profile.gender, age: profile.age } : null,
        progress: { totalQuestions, myAnswers, partnerAnswers },
        messageCount,
      };
    }),
  );
};

export const getMatchByIdService = async (matchId: string, userId: string) => {
  const match = await Match.findById(matchId);
  if (!match) {
    throw { status: 404, message: 'Match not found.', error: 'MATCH_NOT_FOUND' };
  }
  if (match.senderId !== userId && match.receiverId !== userId) {
    throw { status: 403, message: 'Access denied.', error: 'UNAUTHORIZED' };
  }
  return match;
};

export const respondToMatchService = async (
  matchId: string,
  userId: string,
  action: 'accepted' | 'rejected',
) => {
  const match = await Match.findById(matchId);
  if (!match) {
    throw { status: 404, message: 'Match not found.', error: 'MATCH_NOT_FOUND' };
  }
  if (match.receiverId !== userId) {
    throw { status: 403, message: 'Only the receiver can respond to this match.', error: 'UNAUTHORIZED' };
  }
  if (match.status !== 'requested') {
    throw { status: 400, message: `Match is already ${match.status}.`, error: 'INVALID_STATUS' };
  }

  match.status = action;
  await match.save();
  return match;
};

export const submitAnswersService = async (
  matchId: string,
  userId: string,
  answers: { questionId: string; optionId: string }[],
) => {
  const match = await Match.findById(matchId);
  if (!match) {
    throw { status: 404, message: 'Match not found.', error: 'MATCH_NOT_FOUND' };
  }
  if (match.senderId !== userId && match.receiverId !== userId) {
    throw { status: 403, message: 'Access denied.', error: 'UNAUTHORIZED' };
  }
  if (match.status !== 'accepted') {
    throw { status: 400, message: 'Match must be accepted before answering.', error: 'INVALID_STATUS' };
  }

  const ops = answers.map(({ questionId, optionId }) => ({
    updateOne: {
      filter: { matchId: new mongoose.Types.ObjectId(matchId), userId, questionId: new mongoose.Types.ObjectId(questionId) },
      update: { matchId, userId, questionId, optionId },
      upsert: true,
    },
  }));

  await Answer.bulkWrite(ops);

  const questions = await Question.find();
  const totalQuestions = questions.length;

  const senderAnswers = await Answer.countDocuments({ matchId, userId: match.senderId });
  const receiverAnswers = await Answer.countDocuments({ matchId, userId: match.receiverId });

  if (senderAnswers >= totalQuestions && receiverAnswers >= totalQuestions) {
    const score = await calculateCompatibilityScore(matchId, match.senderId, match.receiverId);
    match.status = 'complete';
    match.compatibilityScore = score.compatibility;
    await match.save();
  }

  return { message: 'Answers submitted successfully' };
};

export const submitSingleAnswerService = async (
  matchId: string,
  userId: string,
  questionId: string,
  optionId: string,
): Promise<{ answered: number; total: number }> => {
  const match = await Match.findById(matchId);
  if (!match) {
    throw { status: 404, message: 'Match not found.', error: 'MATCH_NOT_FOUND' };
  }
  if (match.senderId !== userId && match.receiverId !== userId) {
    throw { status: 403, message: 'Access denied.', error: 'UNAUTHORIZED' };
  }
  if (match.status !== 'accepted') {
    throw { status: 400, message: 'Match must be accepted before answering.', error: 'INVALID_STATUS' };
  }

  const matchObjId = new mongoose.Types.ObjectId(matchId);

  await Answer.findOneAndUpdate(
    { matchId: matchObjId, userId, questionId: new mongoose.Types.ObjectId(questionId) },
    { matchId, userId, questionId, optionId },
    { upsert: true },
  );

  const questions = await Question.find();
  const total = questions.length;
  const answered = await Answer.countDocuments({ matchId: matchObjId, userId });

  const senderAnswers = await Answer.countDocuments({ matchId: matchObjId, userId: match.senderId });
  const receiverAnswers = await Answer.countDocuments({ matchId: matchObjId, userId: match.receiverId });

  if (senderAnswers >= total && receiverAnswers >= total && match.status === 'accepted') {
    const score = await calculateCompatibilityScore(matchId, match.senderId, match.receiverId);
    match.status = 'complete';
    match.compatibilityScore = score.compatibility;
    await match.save();
    sendPushNotification(match.senderId, 'Score Ready! 🎉', `Your compatibility score is ${score.compatibility}%`);
    sendPushNotification(match.receiverId, 'Score Ready! 🎉', `Your compatibility score is ${score.compatibility}%`);
  } else if (answered >= total) {
    const partnerId = userId === match.senderId ? match.receiverId : match.senderId;
    sendPushNotification(partnerId, 'Your turn! 🎯', 'Your partner has answered all questions. Go answer yours!');
  }

  return { answered, total };
};

export const getScoreService = async (matchId: string, userId: string): Promise<ScoreResult> => {
  const match = await Match.findById(matchId);
  if (!match) {
    throw { status: 404, message: 'Match not found.', error: 'MATCH_NOT_FOUND' };
  }
  if (match.senderId !== userId && match.receiverId !== userId) {
    throw { status: 403, message: 'Access denied.', error: 'UNAUTHORIZED' };
  }
  if (match.status !== 'complete') {
    throw { status: 400, message: 'Score is only available after both users answer all questions.', error: 'NOT_COMPLETE' };
  }

  const partnerId = match.senderId === userId ? match.receiverId : match.senderId;
  return calculateCompatibilityScore(matchId, userId, partnerId);
};

export const getMessagesService = async (matchId: string, userId: string): Promise<ChatMessage[]> => {
  const match = await Match.findById(matchId);
  if (!match) {
    throw { status: 404, message: 'Match not found.', error: 'MATCH_NOT_FOUND' };
  }
  if (match.senderId !== userId && match.receiverId !== userId) {
    throw { status: 403, message: 'Access denied.', error: 'UNAUTHORIZED' };
  }
  const messages = await Message.find({ matchId: new mongoose.Types.ObjectId(matchId) }).sort({ createdAt: 1 });
  return messages.map((m) => ({
    _id: (m._id as mongoose.Types.ObjectId).toString(),
    senderId: { _id: m.senderId, name: m.senderName },
    text: m.text,
    createdAt: m.createdAt.toISOString(),
  }));
};

export const sendMessageService = async (
  matchId: string,
  userId: string,
  senderName: string,
  text: string,
): Promise<ChatMessage> => {
  const match = await Match.findById(matchId);
  if (!match) {
    throw { status: 404, message: 'Match not found.', error: 'MATCH_NOT_FOUND' };
  }
  if (match.senderId !== userId && match.receiverId !== userId) {
    throw { status: 403, message: 'Access denied.', error: 'UNAUTHORIZED' };
  }
  const message = await Message.create({ matchId, senderId: userId, senderName, text });
  const partnerId = match.senderId === userId ? match.receiverId : match.senderId;
  sendPushNotification(partnerId, senderName, text);
  return {
    _id: (message._id as mongoose.Types.ObjectId).toString(),
    senderId: { _id: userId, name: senderName },
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
};

async function calculateCompatibilityScore(
  matchId: string,
  userAId: string,
  userBId: string,
): Promise<ScoreResult> {
  const questions = await Question.find().sort({ order: 1 });

  const userAAnswers = await Answer.find({ matchId, userId: userAId });
  const userBAnswers = await Answer.find({ matchId, userId: userBId });

  const userAMap = new Map(userAAnswers.map((a) => [a.questionId.toString(), a.optionId.toString()]));
  const userBMap = new Map(userBAnswers.map((a) => [a.questionId.toString(), a.optionId.toString()]));

  let earnedPoints = 0;
  const breakdown: ScoreResult['breakdown'] = [];

  for (const question of questions) {
    const aOptId = userAMap.get(question._id.toString());
    const bOptId = userBMap.get(question._id.toString());

    const aOpt = question.options.find((o) => o._id.toString() === aOptId);
    const bOpt = question.options.find((o) => o._id.toString() === bOptId);

    let points = 0;
    if (aOpt && bOpt) {
      if (aOptId === bOptId) {
        points = 10;
      } else {
        const gap = Math.abs(aOpt.weight - bOpt.weight);
        if (gap <= 1) points = 6;
        else if (gap <= 2) points = 4;
        else points = 2;
      }
    }
    earnedPoints += points;

    breakdown.push({
      questionId: question._id.toString(),
      questionText: question.text,
      yourOption: aOpt?.text ?? 'Not answered',
      partnerOption: bOpt?.text ?? 'Not answered',
      points,
    });
  }

  const totalPoints = questions.length * 10;
  const compatibility = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  return {
    compatibility,
    totalQuestions: questions.length,
    answeredByYou: userAAnswers.length,
    answeredByPartner: userBAnswers.length,
    breakdown,
  };
}
