import { z } from "zod";
import type { FinancialToolExecutor } from "../agent/financial-tool-guard.js";
import type { ToolDefinition } from "../llm/tool-calling/tool-calling.types.js";
import type { RoutineContextSnapshot, RoutineEventSnapshot } from "./routine-context.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scheduleSchema = z.object({ startDate: isoDate.optional(), endDate: isoDate.optional(), limit: z.number().int().min(1).max(40).optional().default(20) }).strict();
const eventSpendSchema = z.object({ query: z.string().trim().min(2).max(160) }).strict();
const emptySchema = z.object({}).strict();

export type RoutineToolName = "get_routine_schedule" | "get_next_commitment" | "get_event_day_spending";
const routineNames = new Set<RoutineToolName>(["get_routine_schedule","get_next_commitment","get_event_day_spending"]);
export function isRoutineToolName(name: string): name is RoutineToolName { return routineNames.has(name as RoutineToolName); }

const dateProps = {
  startDate: { type: ["string","null"], description: "Data inicial inclusiva YYYY-MM-DD." },
  endDate: { type: ["string","null"], description: "Data final inclusiva YYYY-MM-DD." },
};

export const routineToolDefinitions: ToolDefinition[] = [
  { type: "function", function: { name: "get_routine_schedule", description: "Consulta compromissos sincronizados do calendário. Use para agenda, eventos, reuniões, aulas, horários, locais e perguntas como o que tenho hoje/amanhã ou onde vou. Eventos recusados não são retornados.", parameters: { type: "object", properties: { ...dateProps, limit: { type: ["number","null"], description: "Máximo de compromissos, 1 a 40." } }, additionalProperties: false } } },
  { type: "function", function: { name: "get_next_commitment", description: "Retorna o próximo compromisso futuro a partir do instante atual do contexto de rotina.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_event_day_spending", description: "Localiza um compromisso por título/local e consulta o spending observado no mesmo dia ou intervalo. Isso NÃO prova que os gastos foram causados pelo evento.", parameters: { type: "object", properties: { query: { type: "string", description: "Trecho do título ou local do compromisso." } }, required: ["query"], additionalProperties: false } } },
];

function parse(raw: string): unknown {
  const value = raw.trim() ? JSON.parse(raw) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([,v]) => v !== null));
}
function norm(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim(); }
function levenshtein(a: string,b: string): number { const p=Array.from({length:b.length+1},(_,i)=>i), c=new Array<number>(b.length+1); for(let i=1;i<=a.length;i++){c[0]=i;for(let j=1;j<=b.length;j++)c[j]=Math.min(c[j-1]!+1,p[j]!+1,p[j-1]!+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)p[j]=c[j]!;} return p[b.length]!; }
function score(query: string,event: RoutineEventSnapshot): number { const q=norm(query), h=norm(`${event.title} ${event.location??""}`); if(!q||!h)return 0;if(h.includes(q))return 1;const qt=q.split(" ").filter(x=>x.length>=2), ht=h.split(" ").filter(x=>x.length>=2);let best=0;for(const a of qt)for(const b of ht){const sim=1-levenshtein(a,b)/Math.max(a.length,b.length,1);best=Math.max(best,sim);}return best>=.72?best*.85:0; }
function compact(event: RoutineEventSnapshot) { return { id:event.id,title:event.title,location:event.location,startAt:event.startAt,endAt:event.endAt,localStartDate:event.localStartDate,localEndDate:event.localEndDate,allDay:event.allDay,attendanceStatus:event.attendanceStatus,calendarName:event.calendarName }; }

export class RoutineToolExecutor {
  constructor(private readonly context: RoutineContextSnapshot, private readonly financialExecutor: FinancialToolExecutor, private readonly referenceDate: string) {}
  private unavailable() {
    if (this.context.status === "not_connected") return { status:"calendar_not_connected" as const, message:"O Google Calendar ainda não está conectado ao Pipinho. Conecte-o na área Rotina." };
    if (this.context.status === "unavailable") return { status:"calendar_unavailable" as const, message:"O contexto de calendário está temporariamente indisponível." };
    return null;
  }
  async execute(name: RoutineToolName, rawArguments: string): Promise<unknown> {
    const unavailable=this.unavailable(); if(unavailable)return unavailable; const raw=parse(rawArguments);
    if(name === "get_routine_schedule") { const args=scheduleSchema.parse(raw); const start=args.startDate??this.referenceDate,end=args.endDate??start; const events=this.context.events.filter(e=>e.localEndDate>=start&&e.localStartDate<=end).sort((a,b)=>a.startAt.localeCompare(b.startAt)).slice(0,args.limit); return { status:events.length?"ok":"no_data",timezone:this.context.timezone,lastSyncedAt:this.context.lastSyncedAt,period:{startDate:start,endDate:end},eventCount:events.length,events:events.map(compact) }; }
    if(name === "get_next_commitment") { emptySchema.parse(raw); const now=new Date(this.context.generatedAt).getTime(); const event=this.context.events.filter(e=>new Date(e.endAt).getTime()>=now).sort((a,b)=>a.startAt.localeCompare(b.startAt))[0]; return event?{status:"ok",timezone:this.context.timezone,next:compact(event)}:{status:"no_data",timezone:this.context.timezone,message:"Nenhum compromisso futuro está disponível no período sincronizado."}; }
    const args=eventSpendSchema.parse(raw); const ranked=this.context.events.map(event=>({event,score:score(args.query,event)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.event.startAt.localeCompare(b.event.startAt)); const match=ranked[0]; if(!match)return {status:"no_event_match",query:args.query,alternatives:this.context.events.slice().sort((a,b)=>b.startAt.localeCompare(a.startAt)).slice(0,5).map(compact)};
    const spending=await this.financialExecutor("get_spending_summary",JSON.stringify({startDate:match.event.localStartDate,endDate:match.event.localEndDate}));
    return { status:"ok",query:args.query,matchType:match.score>=.99?"exact":"fuzzy",confidence:Number(match.score.toFixed(3)),event:compact(match.event),observedWindow:{startDate:match.event.localStartDate,endDate:match.event.localEndDate},spending,association:"same_calendar_window_not_causal",warning:"Os gastos são apenas os observados no mesmo período do compromisso; o calendário não prova que foram causados pelo evento." };
  }
}
