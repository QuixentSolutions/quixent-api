import axios from 'axios';
import PushToken from '../models/PushToken';
import TurfSpotRole from '../models/platform/Role';

// Expo push, fire-and-forget — copied from match-calculator-api's util.
export async function sendPushNotification(userId: string, title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  try {
    const record = await PushToken.findOne({ userId });
    if (!record?.token) return;

    const response = await axios.post(
      'https://exp.host/--/api/v2/push/send',
      { to: record.token, title, body, data: data ?? {}, sound: 'default', priority: 'high', channelId: 'default' },
      { timeout: 5000 },
    );

    const result = response.data?.data?.[0];
    if (result?.status === 'error' && result?.details?.error === 'DeviceNotRegistered') {
      await PushToken.deleteOne({ userId });
    }
  } catch {
    // never fail the calling operation
  }
}

export async function savePushToken(userId: string, token: string): Promise<void> {
  await PushToken.findOneAndUpdate({ userId }, { userId, token }, { upsert: true });
}

/** Push to every active super_admin (role-row based; env-only supers just check the queue). */
export async function notifySuperAdmins(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  try {
    const rows = await TurfSpotRole.find({ role: 'super_admin', status: 'active' }).select('userId').lean();
    await Promise.all(rows.map((r) => sendPushNotification(r.userId, title, body, data)));
  } catch {
    /* non-critical */
  }
}

/**
 * Transactional email. No SMTP provider is wired yet, so this logs and returns —
 * the call sites are in place. Set up a sender (nodemailer / SES / Resend) and
 * implement here without touching callers. Spec: push works today, email later.
 */
export async function sendEmail(to: string | null | undefined, subject: string, text: string): Promise<void> {
  if (!to) return;
  console.log(`[turf-spot email] to=${to} subject=${JSON.stringify(subject)} :: ${text}`);
}
