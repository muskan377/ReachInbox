import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';

export const prisma = new PrismaClient();

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null
});

export const elastic = new Client({
  node: process.env.ELASTICSEARCH_URL ||
    'http://localhost:9200',

  ...(process.env.ELASTICSEARCH_API_KEY
    ? {
        auth: {
          apiKey: process.env.ELASTICSEARCH_API_KEY
        }
      }
    : {})
});
