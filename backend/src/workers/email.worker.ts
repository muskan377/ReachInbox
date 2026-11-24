import 'dotenv/config';
import nodemailer from 'nodemailer';
import { Worker, Job } from 'bullmq';
import { prisma, redis } from '../lib/clients';
import { env } from '../config/env';
import { indexEmail } from '../services/search';
import { reserveSendSlot, handleLimitHit, deferEmail, reserveSpacing } from '../services/scheduler';

let transporter: nodemailer.Transporter;
async function createTransport() {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return nodemailer.createTransport({ host:process.env.SMTP_HOST||'smtp.ethereal.email', port:Number(process.env.SMTP_PORT||587), secure:false, auth:{ user:process.env.SMTP_USER, pass:process.env.SMTP_PASS } });
  const test = await nodemailer.createTestAccount();
  console.log('Ethereal test account:', test.user, 'Preview emails at https://ethereal.email');
  return nodemailer.createTransport({ host:'smtp.ethereal.email', port:587, secure:false, auth:{ user:test.user, pass:test.pass } });
}
async function processJob(job:Job<{emailId:string}>) {
  const email = await prisma.email.findUnique({ where:{id:job.data.emailId}, include:{user:true} });
  if (!email || email.status==='SENT' || email.status==='FAILED') return;
  if (email.scheduledAt.getTime()>Date.now()+500) { await deferEmail(email.id,email.scheduledAt.getTime()); return; }
  const limit=email.hourlyLimit || env.hourlyLimit;
  const slot=await reserveSendSlot(email.senderEmail,limit);
  if (!slot.allowed) {
    await handleLimitHit(email.userId,email.senderEmail,limit);
    await deferEmail(email.id,slot.nextWindow);
    return;
  }
  const claimed=await prisma.email.updateMany({ where:{id:email.id,status:{in:['SCHEDULED','PROCESSING']}}, data:{status:'PROCESSING'} });
  if (!claimed.count) return;
  try {
    const spacingWait=await reserveSpacing(email.senderEmail,env.minDelay);
    if (spacingWait>0) await new Promise(resolve=>setTimeout(resolve,spacingWait));
    const info=await transporter.sendMail({ from:`${process.env.SMTP_FROM_NAME||'ReachInbox'} <${email.senderEmail}>`,to:email.recipient,subject:email.subject,text:email.body });
    const updated=await prisma.email.update({where:{id:email.id},data:{status:'SENT',sentAt:new Date(),error:null}});
    await indexEmail(updated);
    console.log(`Sent ${email.id} to ${email.recipient}; Ethereal preview: ${nodemailer.getTestMessageUrl(info)}`);
  } catch(error) {
    const message=error instanceof Error?error.message:'Unknown SMTP error';
    await prisma.email.update({where:{id:email.id},data:{status:'FAILED',error:message}});
    throw error;
  }
}
(async()=>{
  transporter=await createTransport();
  const worker=new Worker('outbound-emails',processJob,{connection:redis,concurrency:env.concurrency});
  worker.on('completed',job=>console.log(`Job ${job.id} completed`));
  worker.on('failed',(job,error)=>console.error(`Job ${job?.id} failed`,error.message));
  console.log(`Email worker online (concurrency ${env.concurrency}, minimum send spacing ${env.minDelay}ms)`);
})();
