import MiniSearch from "minisearch";
import type { StoredChat } from "@/lib/chat-storage";

// Light suffix stemmer applied to both indexed terms and query terms, so
// inflected forms match each other ("thinking" ⇄ "think", "queries" ⇄ "query").
// Prefix + fuzzy matching in the search options covers the rest.
function stem(term: string): string {
  let word = term;

  if (word.length > 5 && word.endsWith("ing")) {
    word = word.slice(0, -3);
  } else if (word.length > 4 && word.endsWith("ed")) {
    word = word.slice(0, -2);
  }

  // Undo consonant doubling left behind ("running" -> "runn" -> "run").
  if (word.length > 3 && word.at(-1) === word.at(-2)) {
    word = word.slice(0, -1);
  }

  if (word.length > 4 && word.endsWith("ies")) {
    word = `${word.slice(0, -3)}y`;
  } else if (word.length > 4 && word.endsWith("es")) {
    word = word.slice(0, -2);
  } else if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    word = word.slice(0, -1);
  }

  return word;
}

function processTerm(term: string): string | null {
  const normalized = stem(term.toLowerCase());
  return normalized.length > 0 ? normalized : null;
}

function chatBody(chat: StoredChat): string {
  return chat.messages
    .map((message) => message.content)
    .filter(Boolean)
    .join("\n");
}

export type ChatSearcher = (query: string) => string[];

// Builds an in-memory index over titles and message contents and returns a
// ranked search function producing chat ids, best match first.
export function createChatSearcher(chats: StoredChat[]): ChatSearcher {
  const index = new MiniSearch({
    fields: ["title", "body"],
    processTerm,
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { title: 2 },
    },
  });

  index.addAll(
    chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      body: chatBody(chat),
    })),
  );

  return (query: string) =>
    index.search(query).map((result) => result.id as string);
}
