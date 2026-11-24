import { prisma } from '../lib/clients';
export async function notifyRateLimit(userId: string, sender: string, limit: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { slackAccessToken: true, slackTeamName: true, slackWebhookUrl: true } });
  if (!user?.slackWebhookUrl) return;
  try {
    const response = await fetch(user.slackWebhookUrl, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text: `ReachInbox rate limit reached: sender ${sender} has reached ${limit} emails for this hour. Remaining emails have been deferred.` }) });
    if (!response.ok) console.error('Slack notification failed:', response.statusText);
  } catch (error) { console.error('Slack notification request failed:', error); }
}
