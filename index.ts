import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { connectAuthDB } from './auth/src/config/db';
import { connectMatchDB } from './match-calculator-api/src/config/db';
import { connectThalluVandiDB } from './thallu-vandi-api/src/config/db';

async function start() {
  await Promise.all([connectAuthDB(), connectMatchDB(), connectThalluVandiDB()]);

  // Dynamic imports run after all DBs are connected so model files
  // can safely call authDb.model() / matchDb.model() / thalluVandiDb.model() at evaluation time.
  const { default: authRouter } = await import('./auth/index');
  const { default: matchRouter } = await import('./match-calculator-api/index');
  const { default: thalluVandiRouter } = await import('./thallu-vandi-api/index');
  const { errorHandler } = await import('./auth/src/middleware/errorHandler');

  const app = express();
  const PORT = process.env.PORT ?? 8000;
  const allowedOrigins = (process.env.CLIENT_ORIGINS ?? '').split(',').map((o) => o.trim());

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);

  res.json({
    success: true,
    status: 'ok',
    uptime: Math.floor(process.uptime()),
  });
});

app.get('/test', (req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);

  res.json({
    success: true,
    message: 'ðŸš€ Quixent API Starting...',
  });
});

  app.get('/delete-account', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'delete-account.html'));
  });

  app.get('/join/:code', (req, res) => {
    res.removeHeader('Content-Security-Policy');
    res.sendFile(path.join(process.cwd(), 'public', 'join.html'));
  });

  app.use('/auth', authRouter);
  app.use('/match', matchRouter);
  app.use('/thallu-vandi', thalluVandiRouter);

  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`ðŸš€ Quixent API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('âŒ Failed to start server:', err);
  process.exit(1);
});

