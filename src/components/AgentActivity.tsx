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
    <>
      <div className="panel-head">
        <h2>Agent Activity</h2>
        <div className="topbar-spacer" />
        {activity.length > 0 && (
          <button className="btn btn-ghost" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      <div className="activity-scroll">
        {activity.length === 0 ? (
          <p className="empty">
            No tool calls yet.
            <br />
            Ask an agent to search or save a prompt.
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
              <span
                className={`source source-${entry.source}`}
                title={
                  entry.source === "webmcp"
                    ? "Called through document.modelContext by the browser's agent"
                    : entry.source === "remote"
                      ? "Called by an external agent through the Streamable HTTP MCP endpoint"
                      : "Called by the built-in local model"
                }
              >
                {entry.source === "webmcp"
                  ? "WebMCP"
                  : entry.source === "remote"
                    ? "remote MCP"
                    : "local"}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="tools-foot">
        <h3>Registered tools · {tools.length}</h3>
        <div className="tool-grid">
          {tools.map((tool) => (
            <code className="tool-chip" key={tool}>
              {tool}
            </code>
          ))}
        </div>
        <p className="hint">
          Exposed in-page and through the remote <code>/mcp/</code> endpoint.
        </p>
      </div>
    </>
  );
}
