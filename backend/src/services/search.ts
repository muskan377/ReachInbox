import { elastic } from '../lib/clients';
const index = 'reachinbox-emails';
export async function indexEmail(email: { id:string; userId:string; recipient:string; subject:string; body:string; status:string; scheduledAt:Date; sentAt:Date|null }) {
  try {
    if (!(await elastic.indices.exists({ index }))) await elastic.indices.create({ index });
    await elastic.index({ index, id: email.id, document: { ...email, scheduledAt: email.scheduledAt.toISOString(), sentAt: email.sentAt?.toISOString() } });
  } catch (e) { console.error('Elasticsearch indexing failed:', e); }
}
