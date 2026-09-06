import crypto from 'crypto';

// Classic PayU India "hosted checkout" (hash/sync v1) integration — the flow
// that matches a plain KEY + SALT credential pair. All hashing happens here,
// server-side only; the SALT must never reach client code or a log line.

const PAYU_ENV = (process.env.PAYU_ENV ?? 'test').toLowerCase();

export const PAYU_PAYMENT_URL =
  PAYU_ENV === 'production' ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment';

function getPayuKey(): string {
  const key = process.env.PAYU_KEY;
  if (!key) throw new Error('PAYU_KEY is not set in .env');
  return key;
}

function getPayuSalt(): string {
  const salt = process.env.PAYU_SALT;
  if (!salt) throw new Error('PAYU_SALT is not set in .env');
  return salt;
}

function sha512(input: string): string {
  return crypto.createHash('sha512').update(input).digest('hex');
}

export interface PayuRequestFields {
  txnid: string;
  amount: string; // fixed 2-decimal string, e.g. "500.00"
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}

// Official request-hash sequence:
// key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
export function generateRequestHash(fields: PayuRequestFields): string {
  const parts = [
    getPayuKey(),
    fields.txnid,
    fields.amount,
    fields.productinfo,
    fields.firstname,
    fields.email,
    fields.udf1 ?? '',
    fields.udf2 ?? '',
    fields.udf3 ?? '',
    fields.udf4 ?? '',
    fields.udf5 ?? '',
    '',
    '',
    '',
    '',
    '', // udf6-udf10, always empty for this integration
    getPayuSalt(),
  ];
  return sha512(parts.join('|'));
}

export interface PayuResponseFields {
  status: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  key: string;
}

// Reverse sequence for verifying PayU's callback — MUST pass before any
// status PayU (or a forged client request) reports is ever trusted:
// salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
export function verifyResponseHash(fields: PayuResponseFields, receivedHash: string): boolean {
  if (!receivedHash) return false;
  const parts = [
    getPayuSalt(),
    fields.status,
    '',
    '',
    '',
    '',
    '', // udf10..udf6, always empty
    fields.udf5 ?? '',
    fields.udf4 ?? '',
    fields.udf3 ?? '',
    fields.udf2 ?? '',
    fields.udf1 ?? '',
    fields.email,
    fields.firstname,
    fields.productinfo,
    fields.amount,
    fields.txnid,
    fields.key,
  ];
  const expected = sha512(parts.join('|'));
  return expected === receivedHash;
}

// PayU wants a short, unique, alphanumeric transaction id per attempt.
export function generateTxnId(): string {
  return `TS${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.toUpperCase().slice(0, 25);
}

// Absolute base URL PayU's servers redirect the browser back to (surl/furl).
// For real PayU test/production traffic this must be a publicly reachable
// URL — localhost only works if tunnelled (e.g. ngrok) during dev.
export function getCallbackBaseUrl(): string {
  return (process.env.API_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8000}`).replace(/\/+$/, '');
}

// PayU rejects productinfo/firstname containing pipes or other separator
// characters the hash string relies on — keep them plain.
export function sanitizePayuText(value: string, maxLen = 100): string {
  return value.replace(/[|]/g, ' ').replace(/[^\x20-\x7E]/g, '').trim().slice(0, maxLen) || 'NA';
}
