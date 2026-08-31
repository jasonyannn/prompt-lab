import type { UserAttachment } from "./attachments";

export type KnowledgeItem = UserAttachment & {
  agentId: string;
  createdAt: string;
};

export const MAX_KNOWLEDGE_ITEMS = 12;
export const MAX_KNOWLEDGE_BYTES = 50 * 1024 * 1024;

const DB_NAME = "promptlab-knowledge";
const DB_VERSION = 1;
const STORE_NAME = "items";
const UPDATED_EVENT = "promptlab:knowledge-updated";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("Saved knowledge is unavailable in this browser session.")
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open saved knowledge."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("agentId", "agentId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("Knowledge storage failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Knowledge storage failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Knowledge storage was cancelled."));
    });
    const result = await operation(transaction.objectStore(STORE_NAME));
    await completed;
    return result;
  } finally {
    database.close();
  }
}

function notify() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
  }
}

function sameFile(item: KnowledgeItem, attachment: UserAttachment) {
  return (
    item.name === attachment.name &&
    item.size === attachment.size &&
    item.lastModified === attachment.lastModified
  );
}

export const knowledgeStore = {
  eventName: UPDATED_EVENT,

  async getAll(): Promise<KnowledgeItem[]> {
    return withStore("readonly", async (store) =>
      requestResult(store.getAll() as IDBRequest<KnowledgeItem[]>)
    );
  },

  async get(id: string): Promise<KnowledgeItem | undefined> {
    return withStore("readonly", async (store) =>
      requestResult(store.get(id) as IDBRequest<KnowledgeItem | undefined>)
    );
  },

  async getForAgent(agentId: string): Promise<KnowledgeItem[]> {
    return withStore("readonly", async (store) => {
      const index = store.index("agentId");
      return requestResult(
        index.getAll(IDBKeyRange.only(agentId)) as IDBRequest<KnowledgeItem[]>
      );
    });
  },

  async saveMany(
    agentId: string,
    attachments: UserAttachment[]
  ): Promise<{ saved: KnowledgeItem[]; skipped: string[] }> {
    if (attachments.length === 0) return { saved: [], skipped: [] };

    const existing = await this.getForAgent(agentId);
    const saved: KnowledgeItem[] = [];
    const skipped: string[] = [];
    let count = existing.length;
    let bytes = existing.reduce((sum, item) => sum + item.size, 0);

    for (const attachment of attachments) {
      if (existing.some((item) => sameFile(item, attachment))) {
        skipped.push(`${attachment.name} is already saved.`);
        continue;
      }
      if (count >= MAX_KNOWLEDGE_ITEMS) {
        skipped.push(`This agent can store up to ${MAX_KNOWLEDGE_ITEMS} knowledge files.`);
        break;
      }
      if (bytes + attachment.size > MAX_KNOWLEDGE_BYTES) {
        skipped.push("This agent's saved knowledge would exceed 50 MB.");
        break;
      }

      const item: KnowledgeItem = {
        ...attachment,
        id: crypto.randomUUID(),
        agentId,
        createdAt: new Date().toISOString(),
      };
      saved.push(item);
      existing.push(item);
      count += 1;
      bytes += item.size;
    }

    if (saved.length > 0) {
      await withStore("readwrite", async (store) => {
        await Promise.all(saved.map((item) => requestResult(store.put(item))));
      });
      notify();
    }

    return { saved, skipped };
  },

  async remove(id: string): Promise<boolean> {
    const item = await this.get(id);
    if (!item) return false;
    await withStore("readwrite", async (store) => {
      await requestResult(store.delete(id));
    });
    notify();
    return true;
  },
};

export function knowledgeAsAttachment(item: KnowledgeItem): UserAttachment {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    lastModified: item.lastModified,
    kind: item.kind,
    text: item.text,
    dataUrl: item.dataUrl,
    base64: item.base64,
    truncated: item.truncated,
  };
}
