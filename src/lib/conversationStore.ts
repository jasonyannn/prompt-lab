/**
 * Saved chat conversations.
 *
 * Messages are slimmed before they are written: vision payloads and attachment
 * data URLs are base64 and would exhaust the localStorage quota within a couple
 * of image-heavy chats, and long tool results are truncated for the same reason.
 * Attachment names and sizes survive, so a reloaded conversation still shows
 * what was attached — it just cannot re-send the bytes.
 */

import type { ChatMessage } from "./ollama";

export type Conversation = {
  id: string;
  title: string;
  agentId?: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "promptlab_conversations";
const UPDATED_EVENT = "promptlab:conversations-updated";

const MAX_CONVERSATIONS = 30;
const MAX_TOOL_RESULT = 2_000;

function slim(message: ChatMessage): ChatMessage {
  const slimmed: ChatMessage = {
    role: message.role,
    content:
      message.role === "tool"
        ? message.content.slice(0, MAX_TOOL_RESULT)
        : message.content,
  };

  if (message.display_content) slimmed.display_content = message.display_content;
  if (message.tool_name) slimmed.tool_name = message.tool_name;
  if (message.tool_calls?.length) slimmed.tool_calls = message.tool_calls;
  if (message.attachments?.length) {
    slimmed.attachments = message.attachments.map(
      ({ dataUrl: _dataUrl, ...rest }) => rest
    );
  }

  return slimmed;
}

/** First thing the user said, which is almost always the best label. */
export function titleFor(messages: ChatMessage[]): string {
  const first = messages.find((message) => message.role === "user");
  const text = (first?.display_content ?? first?.content ?? "").trim();
  if (!text) return "New chat";
  const line = text.split("\n")[0].replace(/\s+/g, " ");
  return line.length > 46 ? `${line.slice(0, 44)}…` : line;
}

function read(): Conversation[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Conversation =>
        typeof entry?.id === "string" && Array.isArray(entry?.messages)
    );
  } catch {
    return [];
  }
}

function write(conversations: Conversation[]) {
  const capped = [...conversations]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // Quota exceeded: keep the newest handful rather than losing everything.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(capped.slice(0, 5)));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
}

export const conversationStore = {
  eventName: UPDATED_EVENT,

  getAll(): Conversation[] {
    return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  get(id: string): Conversation | undefined {
    return read().find((conversation) => conversation.id === id);
  },

  /**
   * Writes the messages for a conversation, creating it on first save. Empty
   * conversations are never stored, so opening a new chat and not using it
   * leaves nothing behind.
   */
  save(id: string, messages: ChatMessage[], agentId?: string): Conversation | null {
    if (messages.length === 0) return null;

    const conversations = read();
    const index = conversations.findIndex((entry) => entry.id === id);
    const timestamp = new Date().toISOString();
    const slimmed = messages.map(slim);

    const conversation: Conversation = {
      id,
      title: titleFor(messages),
      agentId,
      messages: slimmed,
      createdAt: index === -1 ? timestamp : conversations[index].createdAt,
      updatedAt: timestamp,
    };

    if (index === -1) conversations.push(conversation);
    else conversations[index] = conversation;

    write(conversations);
    return conversation;
  },

  rename(id: string, title: string) {
    const conversations = read();
    const index = conversations.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    conversations[index] = {
      ...conversations[index],
      title: title.trim() || conversations[index].title,
    };
    write(conversations);
  },

  remove(id: string) {
    write(read().filter((conversation) => conversation.id !== id));
  },

  clear() {
    write([]);
  },
};
