import { useCallback, useEffect, useState } from "react";
import { useWebMCP } from "./hooks/useWebMCP";
import { useRemoteMCP } from "./hooks/useRemoteMCP";
import { Landing } from "./components/Landing";
import { Workspace } from "./components/Workspace";

type Route = "landing" | "app";

function routeFromHash(): Route {
  return window.location.hash === "#/app" ? "app" : "landing";
}

export default function App() {
  /*
   * Registered once, at the root — deliberately *outside* the route switch.
   * Judges open "/" with their agent, so the tools must be live on the landing
   * page too, not just inside the workspace.
   */
  const webmcp = useWebMCP();
  const remoteMcp = useRemoteMCP();

  const [route, setRoute] = useState<Route>(routeFromHash);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const go = useCallback((next: Route) => {
    window.location.hash = next === "app" ? "#/app" : "#/";
    window.scrollTo({ top: 0 });
  }, []);

  if (route === "app") {
    return (
      <Workspace
        webmcp={webmcp}
        remoteMcp={remoteMcp}
        onHome={() => go("landing")}
      />
    );
  }

  return (
    <Landing
      webmcp={webmcp}
      remoteMcp={remoteMcp}
      onEnter={() => go("app")}
    />
  );
}
