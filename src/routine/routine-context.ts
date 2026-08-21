import { z } from "zod";

export const routineEventSchema = z.object({
  id: z.string().trim().min(1).max(240),
  title: z.string().trim().min(1).max(240),
  location: z.string().trim().max(300).nullable().optional().default(null),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  localStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allDay: z.boolean().default(false),
  attendanceStatus: z.enum(["accepted","tentative","needsAction","declined","unknown"]).default("unknown"),
  calendarName: z.string().trim().max(180).nullable().optional().default(null),
}).strict();

export type RoutineEventSnapshot = z.infer<typeof routineEventSchema>;

export const routineContextSchema = z.object({
  status: z.enum(["connected","not_connected","unavailable"]),
  generatedAt: z.string().datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(100).default("UTC"),
  lastSyncedAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
  events: z.array(routineEventSchema).max(80).default([]),
}).strict();

export type RoutineContextSnapshot = z.infer<typeof routineContextSchema>;

export function sanitizeRoutineContext(input: RoutineContextSnapshot | undefined): RoutineContextSnapshot {
  if (!input) return { status: "not_connected", generatedAt: new Date().toISOString(), timezone: "UTC", lastSyncedAt: null, events: [] };
  const parsed = routineContextSchema.parse(input);
  return { ...parsed, events: parsed.events.filter((event) => event.attendanceStatus !== "declined").slice(0, 80) };
}
