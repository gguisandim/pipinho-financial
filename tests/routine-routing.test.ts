import { describe,expect,it } from "vitest";
import { routeFinancialTools } from "../src/agent/financial-tool-router.js";
import { normalizeFinancialToolArguments } from "../src/agent/financial-tool-argument-normalizer.js";
const ref="2026-08-20";
const cases=[
 ["O que eu tenho hoje?","routine_schedule","get_routine_schedule",{startDate:"2026-08-20",endDate:"2026-08-20"}],
 ["O que eu tenho amanhã?","routine_schedule","get_routine_schedule",{startDate:"2026-08-21",endDate:"2026-08-21"}],
 ["Como está minha agenda na próxima semana?","routine_schedule","get_routine_schedule",{startDate:"2026-08-24",endDate:"2026-08-30"}],
 ["Tenho evento no fim de semana?","routine_schedule","get_routine_schedule",{startDate:"2026-08-22",endDate:"2026-08-23"}],
 ["Me mostra minha agenda","routine_schedule","get_routine_schedule",{startDate:"2026-08-20",endDate:"2026-08-27"}],
 ["Qual meu próximo compromisso?","routine_next","get_next_commitment",{}],
 ["Quanto eu gastei no dia da reunião?","routine_finance","get_event_day_spending",{}],
] as const;
describe("Cycle 12 routing",()=>{for(const [q,intent,tool,args] of cases)it(q,()=>{const d=routeFinancialTools(q);expect(d.intent).toBe(intent);expect(d.toolNames).toEqual([tool]);if(tool==="get_routine_schedule"){const n=JSON.parse(normalizeFinancialToolArguments({question:q,name:tool,rawArguments:"{}",referenceDate:ref}));expect(n).toMatchObject(args)}})});
