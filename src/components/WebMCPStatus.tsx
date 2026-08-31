type Props = {
  ready: boolean;
  supported: boolean;
  toolCount: number;
  remoteReady: boolean;
  remoteToolCount: number;
};

export function WebMCPStatus({
  ready,
  supported,
  toolCount,
  remoteReady,
  remoteToolCount,
}: Props) {
  if (ready && remoteReady) {
    return (
      <span
        className="status is-ready"
        title={`${toolCount} in-page tools and ${remoteToolCount} remote tools available`}
      >
        <span className="dot" />
        MCP Ready · local + remote
      </span>
    );
  }

  if (remoteReady) {
    return (
      <span
        className="status is-ready"
        title={`${remoteToolCount} tools available through the remote /mcp endpoint`}
      >
        <span className="dot" />
        Remote MCP Ready · {remoteToolCount} tools
      </span>
    );
  }

  if (ready) {
    return (
      <span
        className="status is-ready"
        title={`${toolCount} tools registered on document.modelContext`}
      >
        <span className="dot" />
        WebMCP Ready · {toolCount} tools
      </span>
    );
  }

  return (
    <span
      className="status is-off"
      title={
        supported
          ? "Registering tools with document.modelContext…"
          : "This browser does not expose document.modelContext"
      }
    >
      <span className="dot" />
      {supported ? "WebMCP connecting…" : "WebMCP unavailable"}
    </span>
  );
}
