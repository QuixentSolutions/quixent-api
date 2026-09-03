import { Router } from 'express';
import { verifyToken } from '../../../auth/src/middleware/verifyToken';
import { validate, asyncHandler } from '../utils/validate';
import { initiatePaymentSchema } from '../schemas/payment.schema';
import { initiatePayment, renderRedirectForm, handlePayuCallback, getPaymentStatus } from '../services/payment.service';

const router = Router();

// Authenticated: the app calls this right after creating a booking.
router.post(
  '/payu/initiate',
  verifyToken,
  validate(initiatePaymentSchema),
  asyncHandler(async (req: any, res) => {
    const result = await initiatePayment(req.user.userId, req.body.bookingId);
    res.json({ success: true, ...result });
  }),
);

// Public: loaded in the app's WebView, auto-submits the hashed form to PayU.
router.get(
  '/payu/redirect/:txnid',
  asyncHandler(async (req, res) => {
    // helmet's default CSP would block the auto-submit inline script and the
    // cross-origin POST to PayU — same workaround already used by /join/:code.
    res.removeHeader('Content-Security-Policy');
    const html = await renderRedirectForm(req.params.txnid);
    res.type('html').send(html);
  }),
);

// Public: PayU POSTs here (form-urlencoded) after the user pays. Never
// trusted without verifying the reverse hash inside handlePayuCallback.
router.post(
  '/payu/success',
  asyncHandler(async (req, res) => {
    res.removeHeader('Content-Security-Policy');
    const html = await handlePayuCallback(req.body, true);
    res.type('html').send(html);
  }),
);

router.post(
  '/payu/failure',
  asyncHandler(async (req, res) => {
    res.removeHeader('Content-Security-Policy');
    const html = await handlePayuCallback(req.body, false);
    res.type('html').send(html);
  }),
);

// Authenticated: the app re-checks the authoritative outcome after the
// WebView closes, instead of trusting the deep-link query params alone.
router.get(
  '/payu/status/:txnid',
  verifyToken,
  asyncHandler(async (req: any, res) => {
    const result = await getPaymentStatus(req.user.userId, req.params.txnid);
    res.json({ success: true, ...result });
  }),
);

export default router;
