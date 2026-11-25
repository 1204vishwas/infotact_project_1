import dotenv from 'dotenv';

dotenv.config();

// Refuse to boot in production with the well-known development secret.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}

export const config = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexusflow',
  mongoDb: process.env.MONGODB_DB || 'nexusflow',
  telemetryCollection: process.env.TELEMETRY_COLLECTION || 'telemetry',
  ingestBatchLimit: Number(process.env.INGEST_BATCH_LIMIT || 1000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'nexusflow-development-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};
