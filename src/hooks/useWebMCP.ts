import { useEffect, useState } from "react";
import {
  clearActivity,
  getActivity,
  isWebMCPAvailable,
  registerPromptTools,
  subscribeToActivity,
  TOOL_NAMES,
  type ActivityEntry,
} from "../lib/webmcp";

export type WebMCPState = {
  /** True once the tools are registered against document.modelContext. */
  ready: boolean;
  /** False when the browser does not implement WebMCP at all. */
  supported: boolean;
  /** Names of the tools exposed to agents. */
  tools: string[];
  /** Most recent agent tool calls, newest first. */
  activity: ActivityEntry[];
  clearActivity: () => void;
};

/**
 * Call once, from the root component. Registers the Prompt Lab tool set with the
 * browser's native WebMCP model context and keeps the agent activity feed live.
 */
export function useWebMCP(): WebMCPState {
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(() => isWebMCPAvailable());
  const [activity, setActivity] = useState<ActivityEntry[]>(() => getActivity());

  useEffect(() => subscribeToActivity(setActivity), []);

  useEffect(() => {
    let controller: AbortController | null = null;
    let cancelled = false;

    void registerPromptTools().then((result) => {
      // Effect was cleaned up mid-registration (React StrictMode double-mount).
      if (cancelled) {
        result?.abort();
        return;
      }

      controller = result;
      setSupported(result !== null);
      setReady(result !== null);
    });

    return () => {
      cancelled = true;
      controller?.abort();
      setReady(false);
    };
  }, []);

  return {
    ready,
    supported,
    tools: TOOL_NAMES,
    activity,
    clearActivity,
  };
}
