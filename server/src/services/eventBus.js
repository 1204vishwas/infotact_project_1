import { EventEmitter } from 'node:events';

// Shared in-process event bus used to keep controllers, the rule engine,
// alert persistence, and the WebSocket hub loosely coupled.
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);
