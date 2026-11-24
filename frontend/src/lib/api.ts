import type {Email,User} from '../types';
export const API=import.meta.env.VITE_API_URL||'http://localhost:4000';
async function request<T>(path:string,options:RequestInit={}):Promise<T>{const res=await fetch(`${API}${path}`,{...options,credentials:'include',headers:{'Content-Type':'application/json',...options.headers}});if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||`Request failed (${res.status})`);}return res.json();}
export const getMe=()=>request<{user:User|null}>('/auth/me');
export const getEmails=(status:'SCHEDULED'|'SENT'|'FAILED')=>request<{emails:Email[]}>(`/api/emails?status=${status}`);
export const searchEmails=(q:string)=>request<{emails:Email[]}>(`/api/emails/search?q=${encodeURIComponent(q)}`);
export const scheduleEmails=(data:{recipients:string[];subject:string;body:string;startAt:string;delaySeconds:number;hourlyLimit:number;senderEmail:string})=>request<{count:number}>('/api/emails/schedule',{method:'POST',body:JSON.stringify(data)});
export const logout=()=>request('/auth/logout',{method:'POST'});
