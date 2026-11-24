import { createHash } from 'crypto';
import { prisma, redis } from '../lib/clients';
import { emailQueue } from '../lib/queue';
import { indexEmail } from './search';
import { notifyRateLimit } from './slack';
import { env } from '../config/env';

export type ScheduleInput = { recipients:string[]; subject:string; body:string; startAt:string; delaySeconds:number; hourlyLimit?:number; senderEmail:string };
export async function scheduleBatch(userId:string, input:ScheduleInput) {
  const start = new Date(input.startAt); if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()-5000) throw new Error('Start time must be a valid future date/time.');
  const delay = Math.max(0, Math.min(input.delaySeconds, 3600));
  const created = [];
  for (let i=0;i<input.recipients.length;i++) {
    const recipient = input.recipients[i].trim().toLowerCase();
    const key = createHash('sha256').update(`${userId}|${recipient}|${input.subject}|${input.body}|${start.toISOString()}|${i}`).digest('hex');
    const scheduledAt = new Date(start.getTime()+i*delay*1000);
    const email = await prisma.email.upsert({ where:{ idempotencyKey:key }, update:{}, create:{ idempotencyKey:key,userId,recipient,subject:input.subject,body:input.body,senderEmail:input.senderEmail,hourlyLimit:input.hourlyLimit ?? env.hourlyLimit,scheduledAt } });
    await emailQueue.add('send-email', { emailId:email.id }, { jobId:email.id, delay:Math.max(0,scheduledAt.getTime()-Date.now()) });
    await indexEmail(email); created.push(email);
  }
  return created;
}

// Redis Lua makes hourly reservations atomic across all worker processes.
const reserveScript = `local count=tonumber(redis.call('GET',KEYS[1]) or '0'); local limit=tonumber(ARGV[1]); if count < limit then local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],7200) end; return {1,n} else return {0,count} end`;
export async function reserveSendSlot(sender:string, limit:number) {
  const hour = Math.floor(Date.now()/3600000); const key=`send-limit:${sender}:${hour}`;
  const result = await redis.eval(reserveScript,1,key,String(limit)) as [number,number];
  return { allowed:Number(result[0])===1, count:Number(result[1]), nextWindow:(hour+1)*3600000 };
}
export async function handleLimitHit(userId:string,sender:string,limit:number) {
  const notifyKey=`limit-notified:${sender}:${Math.floor(Date.now()/3600000)}`;
  const shouldNotify=await redis.set(notifyKey,'1','EX',7200,'NX');
  if (shouldNotify) await notifyRateLimit(userId,sender,limit);
}
export async function deferEmail(emailId:string,nextAt:number) {
  const delay=Math.max(1000,nextAt-Date.now());
  await emailQueue.add('send-email',{emailId},{jobId:`${emailId}-deferred-${Math.floor(nextAt/3600000)}`,delay, removeOnComplete:true});
}

const spacingScript = `local now=tonumber(ARGV[1]); local gap=tonumber(ARGV[2]); local nextAt=tonumber(redis.call('GET',KEYS[1]) or '0'); local slot=math.max(now,nextAt); redis.call('SET',KEYS[1],slot+gap,'PX',math.max(gap*3,60000)); return slot-now`;
export async function reserveSpacing(sender:string, gapMs:number) { return Number(await redis.eval(spacingScript,1,`send-spacing:${sender}`,String(Date.now()),String(gapMs))); }
