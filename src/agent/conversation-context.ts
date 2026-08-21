export type ConversationRole = "user" | "assistant";

export interface ConversationHistoryMessage {
  role: ConversationRole;
  content: string;
}

const FOLLOW_UP_PATTERNS = [
  /^e\b/i,
  /\b(e isso|isso|nisso|desse|dessa|dele|dela|tamb[eé]m)\b/i,
  /\b(m[eê]s passado|semana passada|ontem|hoje|agora)\b/i,
  /\b(aquele|aquela|aquilo)\b/i,
  /\b(no nubank|no neon|no picpay|no roxinho|nesse banco|nessa institui[cç][aã]o|nessa conta|nesse cart[aã]o)\b/i,
  /\b(l[aá]|ali|mesmo lugar|mesma conta)\b/i,
];

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeConversationHistory(
  history: ConversationHistoryMessage[] | undefined,
  maxMessages = 10,
): ConversationHistoryMessage[] {
  if (!history?.length) return [];

  return history
    .slice(-maxMessages)
    .map((message) => ({
      role: message.role,
      content: compact(message.content).slice(0, 1000),
    }))
    .filter((message) => message.content.length > 0);
}

export function isLikelyConversationalFollowUp(question: string): boolean {
  const clean = compact(question);
  if (!clean) return false;

  const wordCount = clean.split(/\s+/).length;
  return wordCount <= 12 && FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(clean));
}

export function sanitizeConversationMemorySummary(
  summary: string | undefined,
  maxLength = 1400,
): string | undefined {
  if (!summary) return undefined;
  const clean = compact(summary).slice(0, maxLength);
  return clean || undefined;
}

export function buildContextualRoutingQuestion(
  question: string,
  history: ConversationHistoryMessage[] | undefined,
  memorySummary?: string,
): string {
  const cleanQuestion = compact(question);
  const safeHistory = sanitizeConversationHistory(history);
  if (!isLikelyConversationalFollowUp(cleanQuestion)) {
    return cleanQuestion;
  }

  const previousUser = [...safeHistory]
    .reverse()
    .find((message) => message.role === "user");

  if (previousUser) {
    return `${cleanQuestion}\nContexto da pergunta anterior: ${previousUser.content}`;
  }

  const safeMemorySummary = sanitizeConversationMemorySummary(memorySummary);
  if (safeMemorySummary) {
    return `${cleanQuestion}\nContexto persistente da conversa (somente para resolver referências, não é evidência financeira): ${safeMemorySummary}`;
  }

  return cleanQuestion;
}
