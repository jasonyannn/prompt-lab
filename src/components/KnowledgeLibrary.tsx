import { useCallback, useEffect, useState } from "react";
import type { PromptAgent } from "../lib/agentStore";
import {
  formatBytes,
  MAX_ATTACHMENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type UserAttachment,
} from "../lib/attachments";
import {
  knowledgeAsAttachment,
  knowledgeStore,
  type KnowledgeItem,
} from "../lib/knowledgeStore";

type Props = {
  agent?: PromptAgent;
  attachments: UserAttachment[];
  onAttachmentsChange: (attachments: UserAttachment[]) => void;
  compact?: boolean;
};

export function KnowledgeLibrary({
  agent,
  attachments,
  onAttachmentsChange,
  compact = false,
}: Props) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!agent) {
      setItems([]);
      return;
    }
    try {
      const next = await knowledgeStore.getForAgent(agent.id);
      setItems(next.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [agent]);

  useEffect(() => {
    void refresh();
    window.addEventListener(knowledgeStore.eventName, refresh);
    return () => window.removeEventListener(knowledgeStore.eventName, refresh);
  }, [refresh]);

  async function saveCurrent() {
    if (!agent || attachments.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await knowledgeStore.saveMany(agent.id, attachments);
      if (result.skipped.length) setError(result.skipped.join(" "));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function useItems(selected: KnowledgeItem[]) {
    const next = [...attachments];
    let total = next.reduce((sum, attachment) => sum + attachment.size, 0);
    let omitted = 0;

    for (const item of selected) {
      if (next.some((attachment) => attachment.id === item.id)) continue;
      if (
        next.length >= MAX_ATTACHMENTS ||
        total + item.size > MAX_TOTAL_ATTACHMENT_BYTES
      ) {
        omitted += 1;
        continue;
      }
      next.push(knowledgeAsAttachment(item));
      total += item.size;
    }

    onAttachmentsChange(next);
    setError(
      omitted
        ? `${omitted} saved file${omitted === 1 ? " was" : "s were"} not added because active attachment limits were reached.`
        : null
    );
  }

  async function remove(item: KnowledgeItem) {
    setBusy(true);
    setError(null);
    try {
      await knowledgeStore.remove(item.id);
      setConfirmRemoveId(null);
      onAttachmentsChange(
        attachments.filter((attachment) => attachment.id !== item.id)
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!agent) return null;

  return (
    <div className={`knowledge-library${compact ? " is-compact" : ""}`}>
      <div className="knowledge-head">
        <span>
          <strong>Agent knowledge</strong>
          <small>{items.length} saved for {agent.name}</small>
        </span>
        <div className="knowledge-actions">
          {items.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => useItems(items)}>
              Use all
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || attachments.length === 0}
            onClick={() => void saveCurrent()}
          >
            {busy ? "Saving…" : "Save attached"}
          </button>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="knowledge-list" aria-label={`Knowledge saved for ${agent.name}`}>
          {items.map((item) => {
            const active = attachments.some((attachment) => attachment.id === item.id);
            return (
              <li key={item.id}>
                <span className="knowledge-file-icon" aria-hidden="true">
                  {item.kind === "image" ? "IMG" : "DOC"}
                </span>
                <span className="knowledge-copy">
                  <strong title={item.name}>{item.name}</strong>
                  <small>{formatBytes(item.size)}</small>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={active}
                  onClick={() => useItems([item])}
                >
                  {active ? "Using" : "Use"}
                </button>
                <button
                  type="button"
                  className={`knowledge-remove${confirmRemoveId === item.id ? " is-confirm" : ""}`}
                  aria-label={
                    confirmRemoveId === item.id
                      ? `Confirm removal of ${item.name}`
                      : `Remove ${item.name} from ${agent.name}'s knowledge`
                  }
                  title={confirmRemoveId === item.id ? "Click again to remove" : "Remove"}
                  disabled={busy}
                  onClick={() => {
                    if (confirmRemoveId === item.id) void remove(item);
                    else setConfirmRemoveId(item.id);
                  }}
                >
                  {confirmRemoveId === item.id ? "✓" : "×"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="knowledge-empty">Save attached files once, then reuse them in future sessions.</p>
      )}

      {error && <p className="attachment-error" role="alert">{error}</p>}
    </div>
  );
}
