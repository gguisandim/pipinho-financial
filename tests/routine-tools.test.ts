import { describe, expect, it, vi } from "vitest";
import { RoutineToolExecutor } from "../src/routine/routine-tools.js";
import { evaluateCausalGrounding } from "../src/agent/causal-grounding.js";

import type { RoutineContextSnapshot } from "../src/routine/routine-context.js";
const context:RoutineContextSnapshot={status:"connected",generatedAt:"2026-08-20T16:00:00.000Z",timezone:"America/Belem",lastSyncedAt:"2026-08-20T15:30:00.000Z",events:[{id:"e1",title:"Reunião do projeto",location:"UFPA",startAt:"2026-08-21T12:00:00.000Z",endAt:"2026-08-21T14:00:00.000Z",localStartDate:"2026-08-21",localEndDate:"2026-08-21",allDay:false,attendanceStatus:"accepted",calendarName:"Principal"},{id:"e2",title:"Academia",location:"Belém",startAt:"2026-08-22T21:00:00.000Z",endAt:"2026-08-22T22:00:00.000Z",localStartDate:"2026-08-22",localEndDate:"2026-08-22",allDay:false,attendanceStatus:"accepted",calendarName:"Principal"}]};
describe("RoutineToolExecutor",()=>{it("filtra agenda",async()=>{const x=new RoutineToolExecutor(context,vi.fn(),"2026-08-20"),r=await x.execute("get_routine_schedule",JSON.stringify({startDate:"2026-08-21",endDate:"2026-08-21"})) as any;expect(r.eventCount).toBe(1);expect(r.events[0].title).toBe("Reunião do projeto")});it("retorna próximo",async()=>{const x=new RoutineToolExecutor(context,vi.fn(),"2026-08-20"),r=await x.execute("get_next_commitment","{}") as any;expect(r.next.id).toBe("e1")});it("combina evento com spending sem causalidade",async()=>{const f=vi.fn(async(_n:string,a:string)=>({status:"ok",args:JSON.parse(a),netSpending:42.5})),x=new RoutineToolExecutor(context,f,"2026-08-20"),r=await x.execute("get_event_day_spending",JSON.stringify({query:"reuniao"})) as any;expect(r.association).toBe("same_calendar_window_not_causal");expect(f).toHaveBeenCalledWith("get_spending_summary",JSON.stringify({startDate:"2026-08-21",endDate:"2026-08-21"}))});it("degrada sem conexão",async()=>{const x=new RoutineToolExecutor({status:"not_connected",generatedAt:"2026-08-20T16:00:00.000Z",timezone:"UTC",lastSyncedAt:null,events:[]},vi.fn(),"2026-08-20"),r=await x.execute("get_next_commitment","{}") as any;expect(r.status).toBe("calendar_not_connected")})});

describe("Cycle 12 causal boundary", () => {
  const eventTool = [{
    iteration: 1,
    id: "routine-1",
    name: "get_event_day_spending",
    arguments: { query: "reunião" },
    outcome: "executed" as const,
    result: {
      status: "ok",
      event: { title: "Reunião do projeto" },
      spending: { netSpending: 42.5 },
      association: "same_calendar_window_not_causal",
    },
  }];

  it("aceita descrição de coincidência temporal", () => {
    expect(
      evaluateCausalGrounding(
        "No dia da reunião, foram observados R$ 42,50 em gastos.",
        eventTool,
      ).passed,
    ).toBe(true);
  });

  it("rejeita causalidade inventada entre evento e gasto", () => {
    const result = evaluateCausalGrounding(
      "Você gastou R$ 42,50 na reunião do projeto.",
      eventTool,
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((item) => item.code === "unsupported_event_causality")).toBe(true);
  });
});
