import { Router } from 'express';
import {
  compileGraphHandler,
  deactivateGraphHandler,
  getActiveGraphHandler,
  simulateGraphHandler,
  validateGraphHandler,
} from '../controllers/graphController.js';
import {
  activateSavedGraph,
  createSavedGraph,
  deactivateSavedGraph,
  deleteSavedGraph,
  getSavedGraph,
  listSavedGraphs,
  updateSavedGraph,
} from '../controllers/savedGraphController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

export const graphRouter = Router();

// Public: validation, simulation, and non-activating compilation. Everything
// that reads or changes a user's running rules needs a session, and rule status
// is scoped to the caller so owners cannot inspect each other's rules.
graphRouter.post('/validate', validateGraphHandler);
graphRouter.post('/compile', optionalAuth, compileGraphHandler);
graphRouter.post('/simulate', simulateGraphHandler);
graphRouter.get('/active', requireAuth, getActiveGraphHandler);
graphRouter.post('/deactivate', requireAuth, deactivateGraphHandler);

graphRouter.get('/saved', requireAuth, listSavedGraphs);
graphRouter.post('/saved', requireAuth, createSavedGraph);
graphRouter.get('/saved/:id', requireAuth, getSavedGraph);
graphRouter.put('/saved/:id', requireAuth, updateSavedGraph);
graphRouter.delete('/saved/:id', requireAuth, deleteSavedGraph);
graphRouter.post('/saved/:id/activate', requireAuth, activateSavedGraph);
graphRouter.post('/saved/:id/deactivate', requireAuth, deactivateSavedGraph);
