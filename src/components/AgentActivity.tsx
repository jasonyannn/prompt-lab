import type { ActivityEntry } from "../lib/webmcp";

type Props = {
  activity: ActivityEntry[];
  tools: string[];
  onClear: () => void;
};

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AgentActivity({ activity, tools, onClear }: Props) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="panel">
        <div className="panel-head">
          <h2>Agent Activity</h2>
          <div className="topbar-spacer" />
          {activity.length > 0 && (
            <button className="btn btn-ghost" onClick={onClear}>
              Clear
            </button>
          )}
        </div>

        <div className="panel-scroll" style={{ maxHeight: "44vh" }}>
          {activity.length === 0 ? (
            <p className="empty">
              No agent calls yet.
              <br />
              Ask your browser agent to search or save a prompt.
            </p>
          ) : (
            activity.map((entry) => (
              <div
                key={entry.id}
                className={`activity-item${entry.ok ? "" : " is-error"}`}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="activity-tool">
                    {entry.ok ? "" : "✕ "}
                    {entry.tool}
                  </span>
                  <span className="activity-time">{timeOf(entry.at)}</span>
                </div>
                <div className="activity-summary">{entry.summary}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Registered Tools</h2>
        </div>
        <div className="panel-body">
          {tools.map((tool) => (
            <code className="tool-chip" key={tool}>
              {tool}
            </code>
          ))}
          <p className="hint">
            Exposed via <code>document.modelContext.registerTool()</code>
          </p>
        </div>
      </section>
    </div>
  );
}
