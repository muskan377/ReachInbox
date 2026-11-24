export type User={id:string;name:string;email:string;avatar?:string|null;slackTeamName?:string|null};
export type Email={id:string;recipient:string;subject:string;body:string;senderEmail:string;scheduledAt:string;sentAt?:string|null;status:'SCHEDULED'|'PROCESSING'|'SENT'|'FAILED';error?:string|null};
