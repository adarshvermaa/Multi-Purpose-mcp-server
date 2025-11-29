export function chunkTextPreserveLines(
  text: string,
  chunkSizeChars = 7000
): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let start = 0;
  const len = text.length;
  while (start < len) {
    let end = Math.min(len, start + chunkSizeChars);
    if (end < len) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > start + Math.floor(chunkSizeChars * 0.6)) end = nl + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
