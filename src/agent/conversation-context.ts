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
  /\b(no nubank|no neon|no picpay|nesse banco|nessa institui[cç][aã]o)\b/i,
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

export function buildContextualRoutingQuestion(
  question: string,
  history: ConversationHistoryMessage[] | undefined,
): string {
  const cleanQuestion = compact(question);
  const safeHistory = sanitizeConversationHistory(history);
  if (!isLikelyConversationalFollowUp(cleanQuestion) || safeHistory.length === 0) {
    return cleanQuestion;
  }

  const previousUser = [...safeHistory]
    .reverse()
    .find((message) => message.role === "user");

  if (!previousUser) return cleanQuestion;

  return `${cleanQuestion}\nContexto da pergunta anterior: ${previousUser.content}`;
}
