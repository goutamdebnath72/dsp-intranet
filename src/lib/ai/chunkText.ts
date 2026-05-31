// src/lib/ai/chunkText.ts
export function cleanTextForChunks(raw: string): string {
  if (!raw) return "";
  // Normalize newlines and collapse whitespace
  return raw.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

/**
 * Split text into word-based chunks.
 * Default chunk size = 200 words.
 */
export function chunkTextByWords(text: string, chunkWords = 200): string[] {
  const cleaned = cleanTextForChunks(text);
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkWords) {
    const chunk = words
      .slice(i, i + chunkWords)
      .join(" ")
      .trim();
    if (chunk.length) chunks.push(chunk);
  }
  return chunks;
}
