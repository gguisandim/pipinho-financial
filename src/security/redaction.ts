export function maskIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "<redacted>";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(/\/items\/[^?\s/]+/gi, "/items/<redacted>")
    .replace(/([?&](?:itemId|accountId)=)[^&\s]+/gi, "$1<redacted>")
    .replace(
      /\b((?:itemId|accountId)\s*[:=]\s*)[A-Za-z0-9_-]{8,}\b/gi,
      "$1<redacted>",
    );
}
