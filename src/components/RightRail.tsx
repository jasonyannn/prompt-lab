import { useState } from "react";
import { AgentChat } from "./AgentChat";
import { AgentActivity } from "./AgentActivity";
import type { ActivityEntry } from "../lib/webmcp";

type Tab = "agent" | "activity";

type Props = {
  activity: ActivityEntry[];
  tools: string[];
  onClear: () => void;
};

export function RightRail({ activity, tools, onClear }: Props) {
  const [tab, setTab] = useState<Tab>("agent");

  return (
    <div className="rail">
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "agent"}
          className={`tab${tab === "agent" ? " is-active" : ""}`}
          onClick={() => setTab("agent")}
        >
          Local Agent
        </button>
        <button
          role="tab"
          aria-selected={tab === "activity"}
          className={`tab${tab === "activity" ? " is-active" : ""}`}
          onClick={() => setTab("activity")}
        >
          Activity
          {activity.length > 0 && <span className="badge">{activity.length}</span>}
        </button>
      </div>

      <div className="panel rail-panel">
        {tab === "agent" ? (
          <AgentChat />
        ) : (
          <AgentActivity activity={activity} tools={tools} onClear={onClear} />
        )}
      </div>
    </div>
  );
}
