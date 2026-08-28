import { useCallback, useEffect, useState } from "react";
import { agentStore, type PromptAgent } from "../lib/agentStore";

export function useAgents(): { agents: PromptAgent[]; refresh: () => void } {
  const [agents, setAgents] = useState<PromptAgent[]>(() => agentStore.getAll());
  const refresh = useCallback(() => setAgents(agentStore.getAll()), []);

  useEffect(() => {
    window.addEventListener("promptlab:agents-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("promptlab:agents-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { agents, refresh };
}
