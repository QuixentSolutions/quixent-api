import { Router, urlencoded } from 'express';
import { verifyToken } from '../middleware/verifyToken';
import { validate, asyncHandler } from '../utils/validate';
import { initiatePaymentSchema, reconcileSchema } from '../schemas/booking.schema';
import { initiatePayment, handlePayuCallback, reconcile } from '../services/payment.service';

const router = Router();

// PayU posts back as x-www-form-urlencoded with no auth header. These two
// routes parse their own body (root index.ts only mounts express.json()).
const payuBody = urlencoded({ extended: false });

const APP_RESULT_URL = () => process.env.TURFSPOT_APP_RESULT_URL || 'turfspot://payment-result';

function redirectToApp(res: any, status: 'success' | 'failure', bookingId: string | null) {
  const url = `${APP_RESULT_URL()}?status=${status}${bookingId ? `&bookingId=${bookingId}` : ''}`;
  res.redirect(302, url);
}

router.post('/payu/success', payuBody, asyncHandler(async (req, res) => {
  const result = await handlePayuCallback(req.body as Record<string, string>);
  redirectToApp(res, result.ok ? 'success' : 'failure', result.bookingId);
}));

router.post('/payu/failure', payuBody, asyncHandler(async (req, res) => {
  const result = await handlePayuCallback(req.body as Record<string, string>);
  redirectToApp(res, 'failure', result.bookingId);
}));

// ---- authenticated (app) ----
router.use(verifyToken);

// Step 2 of checkout — get the PayU form to auto-submit
router.post('/initiate', validate(initiatePaymentSchema), asyncHandler(async (req: any, res) => {
  const out = await initiatePayment(req.body.bookingId, {
    userId: req.user.userId,
    name: req.user.name,
    email: req.body.email,
    phone: req.user.mobile,
  });
  res.json({ success: true, ...out });
}));

// Poll after returning to the app (backup to the redirect)
router.post('/reconcile', validate(reconcileSchema), asyncHandler(async (req: any, res) => {
  res.json({ success: true, ...(await reconcile(req.body.txnid, req.user.userId)) });
}));

export default router;
