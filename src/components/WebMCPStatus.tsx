type Props = {
  ready: boolean;
  supported: boolean;
  toolCount: number;
};

export function WebMCPStatus({ ready, supported, toolCount }: Props) {
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
