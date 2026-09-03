import crypto from 'crypto';
import axios from 'axios';

// PayU "classic" hosted-checkout integration (merchant key + salt).
// Flow: server builds a request hash -> client POSTs the form to
// `${PAYU_BASE_URL}/_payment` -> PayU redirects the browser to SURL/FURL
// with a response payload -> server verifies the reverse hash + (optionally)
// calls verify_payment server-to-server for a definitive status.

export const PAYU_BASE_URL = () => process.env.PAYU_BASE_URL || 'https://test.payu.in';
const KEY = () => process.env.PAYU_MERCHANT_KEY || '';
const SALT = () => process.env.PAYU_MERCHANT_SALT || '';

export interface PayuRequestParams {
  txnid: string;
  amount: string;        // 2-decimal string, e.g. "1003.00"
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  udf1?: string;         // we put bookingId here
}

// request hash: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
export function buildRequestHash(p: PayuRequestParams): string {
  const udf1 = p.udf1 ?? '';
  const seq = [KEY(), p.txnid, p.amount, p.productinfo, p.firstname, p.email, udf1, '', '', '', '', '', '', '', '', '', SALT()];
  return crypto.createHash('sha512').update(seq.join('|')).digest('hex');
}

// Fields the client needs to auto-submit the PayU form.
export function buildCheckout(p: PayuRequestParams) {
  const hash = buildRequestHash(p);
  return {
    action: `${PAYU_BASE_URL()}/_payment`,
    method: 'POST',
    params: {
      key: KEY(),
      txnid: p.txnid,
      amount: p.amount,
      productinfo: p.productinfo,
      firstname: p.firstname,
      email: p.email,
      phone: p.phone,
      udf1: p.udf1 ?? '',
      surl: process.env.PAYU_SUCCESS_URL || '',
      furl: process.env.PAYU_FAILURE_URL || '',
      hash,
    },
  };
}

// response hash (reverse): sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
export function verifyResponseHash(body: Record<string, string>): boolean {
  const seq = [
    SALT(),
    body.status ?? '',
    '', '', '', '', '',
    body.udf5 ?? '', body.udf4 ?? '', body.udf3 ?? '', body.udf2 ?? '', body.udf1 ?? '',
    body.email ?? '',
    body.firstname ?? '',
    body.productinfo ?? '',
    body.amount ?? '',
    body.txnid ?? '',
    KEY(),
  ];
  const expected = crypto.createHash('sha512').update(seq.join('|')).digest('hex');
  return expected === (body.hash ?? '').toLowerCase();
}

// Server-to-server definitive status check. Returns the per-txn record or null.
export async function verifyPayment(txnid: string): Promise<any | null> {
  const command = 'verify_payment';
  const hash = crypto
    .createHash('sha512')
    .update([KEY(), command, txnid, SALT()].join('|'))
    .digest('hex');

  try {
    const { data } = await axios.post(
      `${PAYU_BASE_URL().replace('test.payu.in', 'test.payu.in').replace('secure.payu.in', 'info.payu.in')}/merchant/postservice?form=2`,
      new URLSearchParams({ key: KEY(), command, var1: txnid, hash }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 },
    );
    return data?.transaction_details?.[txnid] ?? null;
  } catch {
    return null;
  }
}
