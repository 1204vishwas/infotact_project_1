import { Router } from 'express';
import { login, me, register } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ keyPrefix: 'login', max: 20 });
const registerLimiter = rateLimit({ keyPrefix: 'register', max: 10 });

authRouter.post('/register', registerLimiter, register);
authRouter.post('/login', loginLimiter, login);
authRouter.get('/me', requireAuth, me);
