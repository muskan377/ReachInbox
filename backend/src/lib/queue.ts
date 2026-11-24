import { Queue } from 'bullmq';
import { redis } from './clients';
export const emailQueue = new Queue('outbound-emails', { connection: redis, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: { age: 86400, count: 5000 }, removeOnFail: { age: 604800 } } });
