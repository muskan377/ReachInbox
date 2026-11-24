import dotenv from 'dotenv'; dotenv.config();
export const env = {
  port: Number(process.env.PORT || 4000), frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
  minDelay: Number(process.env.MIN_DELAY_BETWEEN_SENDS_MS || 2000),
  hourlyLimit: Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || 200),
};
