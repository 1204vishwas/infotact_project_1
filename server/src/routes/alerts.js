import { Router } from 'express';
import { listAlerts } from '../controllers/alertController.js';
import { requireAuth } from '../middleware/auth.js';

export const alertRouter = Router();

alertRouter.get('/', requireAuth, listAlerts);
