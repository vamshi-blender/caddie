type ContentBlock = {
  type?: string;
  text?: string;
  content?: unknown;
};

export function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join("\n");
  }

  const record = value as Record<string, unknown>;

  if (typeof record.text === "string") return record.text;
  if (typeof record.result === "string") return record.result;

  if (Array.isArray(record.content)) {
    return record.content
      .map((block) => {
        const typedBlock = block as ContentBlock;
        if (typedBlock.type === "text" && typeof typedBlock.text === "string") {
          return typedBlock.text;
        }

        return extractText(block);
      })
      .filter(Boolean)
      .join("\n");
  }

  if (record.message) return extractText(record.message);

  return "";
}

export function firstMeaningfulLine(text: string, fallback: string) {
  const line = text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);

  if (!line) return fallback;
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}
