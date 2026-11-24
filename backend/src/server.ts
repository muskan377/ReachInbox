import 'dotenv/config';
import express from 'express';
app.set('trust proxy', 1);
import cors from 'cors'; import session from 'express-session'; import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { ExpressAdapter } from '@bull-board/express'; import { createBullBoard } from '@bull-board/api'; import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { RedisStore } from 'connect-redis';
import { prisma, redis } from './lib/clients'; import { emailQueue } from './lib/queue'; import { env } from './config/env';
import emailRoutes from './routes/email.routes';
const app=express();
app.use(cors({origin:env.frontendUrl,credentials:true})); app.use(express.json({limit:'10mb'})); app.use(session({store:new RedisStore({client:redis}),secret:process.env.SESSION_SECRET||'local-dev-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite: process.env.NODE_ENV === 'production'
  ? 'none'
  : 'lax',secure:process.env.NODE_ENV==='production',maxAge:7*86400000}}));
app.use(passport.initialize());app.use(passport.session());
passport.serializeUser((user:any,done)=>done(null,user.id));passport.deserializeUser(async(id:string,done)=>{try{done(null,await prisma.user.findUnique({where:{id}}));}catch(e){done(e);}});
if(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET){passport.use(new GoogleStrategy({clientID:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,callbackURL:process.env.GOOGLE_CALLBACK_URL||'http://localhost:4000/auth/google/callback'},async(_a,_r,profile,done)=>{try{const email=profile.emails?.[0]?.value;if(!email)return done(new Error('Google did not provide an email'));const user=await prisma.user.upsert({where:{googleId:profile.id},update:{name:profile.displayName,email,avatar:profile.photos?.[0]?.value},create:{googleId:profile.id,name:profile.displayName,email,avatar:profile.photos?.[0]?.value}});done(null,user);}catch(e){done(e as Error);}}));}
app.get('/auth/google',(req,res,next)=>{if(!process.env.GOOGLE_CLIENT_ID)return res.status(503).send('Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env');passport.authenticate('google',{scope:['profile','email']})(req,res,next);});
app.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:`${env.frontendUrl}/?login=failed`}), (req:any,res)=>{req.session.userId=req.user.id;res.redirect(env.frontendUrl+'/app');});
app.get('/auth/me',async(req:any,res)=>{if(!req.session.userId)return res.status(401).json({user:null});const user=await prisma.user.findUnique({where:{id:req.session.userId},select:{id:true,name:true,email:true,avatar:true,slackTeamName:true}});res.json({user});});
app.post('/auth/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.use('/api/emails',emailRoutes);
const slackEnabled=Boolean(process.env.SLACK_CLIENT_ID&&process.env.SLACK_CLIENT_SECRET);
app.get('/slack/connect',async(req:any,res)=>{if(!req.session.userId)return res.status(401).send('Sign in first');if(!slackEnabled)return res.status(503).send('Configure Slack OAuth credentials.');const state=Buffer.from(JSON.stringify({userId:req.session.userId,nonce:cryptoRandom()})).toString('base64url');await redis.set(`slack-oauth:${state}`,req.session.userId,'EX',600);const url=new URL('https://slack.com/oauth/v2/authorize');url.searchParams.set('client_id',process.env.SLACK_CLIENT_ID!);url.searchParams.set('scope','incoming-webhook');url.searchParams.set('redirect_uri',process.env.SLACK_REDIRECT_URI||'http://localhost:4000/slack/callback');url.searchParams.set('state',state);res.redirect(url.toString());});
app.get('/slack/callback',async(req,res)=>{const state=String(req.query.state||'');const userId=await redis.get(`slack-oauth:${state}`);if(!userId)return res.status(400).send('Invalid or expired Slack OAuth state');await redis.del(`slack-oauth:${state}`);if(req.query.error)return res.redirect(env.frontendUrl+'/app?slack=denied');try{const tokenRes=await fetch('https://slack.com/api/oauth.v2.access',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.SLACK_CLIENT_ID!,client_secret:process.env.SLACK_CLIENT_SECRET!,code:String(req.query.code||''),redirect_uri:process.env.SLACK_REDIRECT_URI||'http://localhost:4000/slack/callback'})});const data=await tokenRes.json() as any;if(!data.ok||!data.incoming_webhook?.url)throw new Error(data.error||'Slack did not return an incoming webhook');await prisma.user.update({where:{id:userId},data:{slackAccessToken:data.access_token,slackWebhookUrl:data.incoming_webhook.url,slackTeamName:data.team?.name||'Connected workspace'}});res.redirect(env.frontendUrl+'/app?slack=connected');}catch(e){res.status(400).send(`Slack connection failed: ${e instanceof Error?e.message:'Unknown error'}`);}});
function cryptoRandom(){return require('crypto').randomBytes(18).toString('hex');}
const board=new ExpressAdapter();createBullBoard({queues:[new BullMQAdapter(emailQueue)],serverAdapter:board});board.setBasePath('/admin/queues');app.use('/admin/queues',board.getRouter());
app.get('/health',(_req,res)=>res.json({ok:true,service:'reachinbox-api'}));
app.listen(env.port,()=>console.log(`ReachInbox API listening on http://localhost:${env.port}`));
