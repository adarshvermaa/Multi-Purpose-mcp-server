// src/services/ai.utils.ts
export function extractAssistantContent(resp: any): string {
  if (!resp) return "";
  const choice = resp.choices?.[0] ?? resp?.output?.[0] ?? null;
  if (!choice) return "";

  // Several SDK shapes:
  // - choice.message.content (string)
  // - choice.message.content.parts (array)
  // - choice.text (older shape)
  // - choice.message?.content (string or array)
  const msg = choice.message ?? choice;
  let content = "";

  if (msg?.content && typeof msg.content === "string") {
    content = msg.content;
  } else if (msg?.content && Array.isArray(msg.content)) {
    content = msg.content.join("");
  } else if (choice?.text && typeof choice.text === "string") {
    content = choice.text;
  } else if (
    choice?.message?.content?.parts &&
    Array.isArray(choice.message.content.parts)
  ) {
    content = choice.message.content.parts.join("");
  }

  return content ?? "";
}
