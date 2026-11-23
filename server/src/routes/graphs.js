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

// Public: validation, simulation, non-activating compilation, and reading the
// list of running rules. Activation and saved-graph CRUD require a session.
graphRouter.post('/validate', validateGraphHandler);
graphRouter.post('/compile', optionalAuth, compileGraphHandler);
graphRouter.post('/simulate', simulateGraphHandler);
graphRouter.get('/active', getActiveGraphHandler);
graphRouter.post('/deactivate', requireAuth, deactivateGraphHandler);

graphRouter.get('/saved', requireAuth, listSavedGraphs);
graphRouter.post('/saved', requireAuth, createSavedGraph);
graphRouter.get('/saved/:id', requireAuth, getSavedGraph);
graphRouter.put('/saved/:id', requireAuth, updateSavedGraph);
graphRouter.delete('/saved/:id', requireAuth, deleteSavedGraph);
graphRouter.post('/saved/:id/activate', requireAuth, activateSavedGraph);
graphRouter.post('/saved/:id/deactivate', requireAuth, deactivateSavedGraph);
