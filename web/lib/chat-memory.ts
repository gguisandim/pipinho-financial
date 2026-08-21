import type { SupabaseClient } from "@supabase/supabase-js";

export const CHAT_CONTEXT_MESSAGE_LIMIT = 10;
export const CHAT_DISPLAY_MESSAGE_LIMIT = 100;
export const CHAT_SESSION_LIST_LIMIT = 24;

export interface RoutingMemory {
  version: 1;
  recentUserQuestions: string[];
}

export interface ChatSessionRecord {
  id: string;
  title: string;
  routingMemory: RoutingMemory;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: number;
  role: "user" | "assistant";
  content: string;
  verified: boolean | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const EMPTY_ROUTING_MEMORY: RoutingMemory = {
  version: 1,
  recentUserQuestions: [],
};

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRoutingMemory(value: unknown): RoutingMemory {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_ROUTING_MEMORY;
  }
  const candidate = value as { version?: unknown; recentUserQuestions?: unknown };
  if (!Array.isArray(candidate.recentUserQuestions)) return EMPTY_ROUTING_MEMORY;

  return {
    version: 1,
    recentUserQuestions: candidate.recentUserQuestions
      .filter((item): item is string => typeof item === "string")
      .map((item) => compact(item).slice(0, 240))
      .filter(Boolean)
      .slice(-5),
  };
}

export function makeConversationTitle(question: string): string {
  const clean = compact(question);
  if (!clean) return "Nova conversa";
  return clean.length <= 58 ? clean : `${clean.slice(0, 55).trimEnd()}…`;
}

export function appendRoutingQuestion(
  memory: RoutingMemory | unknown,
  question: string,
): RoutingMemory {
  const current = normalizeRoutingMemory(memory);
  const clean = compact(question).slice(0, 240);
  if (!clean) return current;

  return {
    version: 1,
    recentUserQuestions: [...current.recentUserQuestions, clean].slice(-5),
  };
}

export function routingMemoryToSummary(memory: RoutingMemory | unknown): string | undefined {
  const normalized = normalizeRoutingMemory(memory);
  if (!normalized.recentUserQuestions.length) return undefined;

  return `Perguntas anteriores desta conversa: ${normalized.recentUserQuestions.join(" | ")}`.slice(0, 1400);
}

export function getChatRetentionDays(): number {
  const raw = process.env.PIPINHO_CHAT_RETENTION_DAYS?.trim();
  if (!raw) return 365;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 365;
  if (parsed === 0) return 0;
  return Math.min(3650, Math.max(30, parsed));
}

function throwMemoryError(action: string, error: { message?: string } | null): never {
  throw new Error(`chat_memory_${action}: ${error?.message ?? "unknown_error"}`);
}

export async function pruneExpiredChatSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const retentionDays = getChatRetentionDays();
  if (retentionDays === 0) return 0;

  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("pipinho_chat_sessions")
    .delete()
    .eq("user_id", userId)
    .lt("updated_at", cutoff)
    .select("id");

  if (error) throwMemoryError("prune", error);
  return data?.length ?? 0;
}

export async function listChatSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<ChatSessionRecord[]> {
  const { data, error } = await supabase
    .from("pipinho_chat_sessions")
    .select("id,title,routing_memory,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(CHAT_SESSION_LIST_LIMIT);

  if (error) throwMemoryError("list", error);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    routingMemory: normalizeRoutingMemory(row.routing_memory),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function getChatSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<ChatSessionRecord | null> {
  const { data, error } = await supabase
    .from("pipinho_chat_sessions")
    .select("id,title,routing_memory,created_at,updated_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throwMemoryError("session", error);
  if (!data) return null;

  return {
    id: String(data.id),
    title: String(data.title),
    routingMemory: normalizeRoutingMemory(data.routing_memory),
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

export async function getChatMessages(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  limit = CHAT_DISPLAY_MESSAGE_LIMIT,
): Promise<ChatMessageRecord[]> {
  const safeLimit = Math.min(CHAT_DISPLAY_MESSAGE_LIMIT, Math.max(1, limit));
  const { data, error } = await supabase
    .from("pipinho_chat_messages")
    .select("id,role,content,verified,metadata,created_at")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("id", { ascending: false })
    .limit(safeLimit);

  if (error) throwMemoryError("messages", error);

  return (data ?? [])
    .reverse()
    .map((row) => ({
      id: Number(row.id),
      role: row.role === "assistant" ? "assistant" : "user",
      content: String(row.content),
      verified: typeof row.verified === "boolean" ? row.verified : null,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {},
      createdAt: String(row.created_at),
    }));
}

export async function createChatSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  firstQuestion: string,
): Promise<ChatSessionRecord> {
  const now = new Date().toISOString();
  const routingMemory = EMPTY_ROUTING_MEMORY;
  const { data, error } = await supabase
    .from("pipinho_chat_sessions")
    .insert({
      id: sessionId,
      user_id: userId,
      title: makeConversationTitle(firstQuestion),
      routing_memory: routingMemory,
      created_at: now,
      updated_at: now,
    })
    .select("id,title,routing_memory,created_at,updated_at")
    .single();

  if (error) throwMemoryError("create", error);

  return {
    id: String(data.id),
    title: String(data.title),
    routingMemory: normalizeRoutingMemory(data.routing_memory),
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

export async function persistChatTurn(options: {
  supabase: SupabaseClient;
  userId: string;
  session: ChatSessionRecord;
  question: string;
  answer: string;
  verified: boolean;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const now = new Date().toISOString();
  const nextRoutingMemory = appendRoutingQuestion(options.session.routingMemory, options.question);

  const { error: messageError } = await options.supabase
    .from("pipinho_chat_messages")
    .insert([
      {
        session_id: options.session.id,
        user_id: options.userId,
        role: "user",
        content: options.question,
        verified: null,
        metadata: {},
        created_at: now,
      },
      {
        session_id: options.session.id,
        user_id: options.userId,
        role: "assistant",
        content: options.answer.slice(0, 12000),
        verified: options.verified,
        metadata: options.metadata,
        created_at: now,
      },
    ]);

  if (messageError) throwMemoryError("persist_messages", messageError);

  const { error: sessionError } = await options.supabase
    .from("pipinho_chat_sessions")
    .update({
      routing_memory: nextRoutingMemory,
      updated_at: now,
    })
    .eq("id", options.session.id)
    .eq("user_id", options.userId);

  if (sessionError) throwMemoryError("update_session", sessionError);
}

export async function deleteChatSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("pipinho_chat_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("id");

  if (error) throwMemoryError("delete", error);
  return (data?.length ?? 0) > 0;
}

export async function deleteAllChatSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("pipinho_chat_sessions")
    .delete()
    .eq("user_id", userId)
    .select("id");

  if (error) throwMemoryError("delete_all", error);
  return data?.length ?? 0;
}
