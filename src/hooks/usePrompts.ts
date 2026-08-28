import { useCallback, useEffect, useState } from "react";
import { promptStore, type Prompt } from "../lib/promptStore";

/**
 * Live view of the prompt library.
 *
 * promptStore.write() dispatches `promptlab:prompts-updated` on every mutation,
 * so agent tool calls and UI edits both land here and re-render immediately.
 */
export function usePrompts(): { prompts: Prompt[]; refresh: () => void } {
  const [prompts, setPrompts] = useState<Prompt[]>(() => promptStore.getAll());

  const refresh = useCallback(() => setPrompts(promptStore.getAll()), []);

  useEffect(() => {
    window.addEventListener("promptlab:prompts-updated", refresh);
    // Keep multiple tabs in sync too.
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("promptlab:prompts-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { prompts, refresh };
}
