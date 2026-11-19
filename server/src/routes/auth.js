import { Router } from 'express';
import { login, me, register, socialLogin } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/social', socialLogin);
authRouter.get('/me', requireAuth, me);
