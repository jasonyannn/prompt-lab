import { useEffect, useMemo, useState } from "react";
import { mergeRemoteActivity, type ActivityEntry } from "../lib/webmcp";

type StatusResponse = {
  ready?: boolean;
  endpoint?: string;
  transport?: string;
  protocolVersions?: string[];
  toolCount?: number;
  tools?: string[];
};

type ActivityResponse = {
  activity?: Array<Omit<ActivityEntry, "source">>;
};

export type RemoteMCPState = {
  ready: boolean;
  checking: boolean;
  endpoint: string;
  transport: string;
  protocolVersions: string[];
  tools: string[];
};

const FALLBACK_TOOLS = [
  "search_products",
  "list_agents",
  "create_agent",
  "update_agent",
  "search_prompts",
  "get_prompt",
  "create_prompt",
  "update_prompt",
  "create_prompt_version",
  "create_prompt_variant",
  "get_prompt_history",
  "compare_prompt_versions",
  "rate_prompt",
  "record_prompt_use",
  "render_prompt",
  "delete_prompt",
];

const APP_BASE = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export function useRemoteMCP(): RemoteMCPState {
  // This is the URL users copy to connect an agent, so it keeps the trailing
  // slash: the Sites edge answers a bare /mcp with its own 404 before the
  // request reaches the worker, and only /mcp/ reaches the MCP handler.
  const endpoint = useMemo(
    () => new URL(`${APP_BASE}mcp/`, window.location.origin).href,
    []
  );
  const [state, setState] = useState<Omit<RemoteMCPState, "endpoint">>({
    ready: false,
    checking: true,
    transport: "Streamable HTTP",
    protocolVersions: ["2026-07-28", "2025-11-25"],
    tools: FALLBACK_TOOLS,
  });

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;

    async function refresh() {
      try {
        const response = await fetch(`${APP_BASE}api/mcp/status`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
          throw new Error("Remote MCP is not mounted on this origin.");
        }
        const status = (await response.json()) as StatusResponse;
        setState({
          ready: status.ready === true,
          checking: false,
          transport: status.transport || "Streamable HTTP",
          protocolVersions:
            Array.isArray(status.protocolVersions) && status.protocolVersions.length
              ? status.protocolVersions
              : ["2026-07-28", "2025-11-25"],
          tools:
            Array.isArray(status.tools) && status.tools.length
              ? status.tools
              : FALLBACK_TOOLS,
        });

        if (status.ready) {
          const activityResponse = await fetch(
            `${APP_BASE}api/mcp/activity?limit=25`,
            {
            signal: controller.signal,
            headers: { Accept: "application/json" },
            }
          );
          if (activityResponse.ok) {
            const payload = (await activityResponse.json()) as ActivityResponse;
            if (Array.isArray(payload.activity)) {
              mergeRemoteActivity(
                payload.activity.map((entry) => ({ ...entry, source: "remote" }))
              );
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((current) => ({ ...current, ready: false, checking: false }));
        }
      }

      if (!controller.signal.aborted) {
        timer = window.setTimeout(refresh, 5_000);
      }
    }

    void refresh();
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return { ...state, endpoint };
}
