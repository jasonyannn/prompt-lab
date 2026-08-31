import { useEffect, useState } from "react";
import { checkModel, type ModelStatus } from "../lib/modelClient";

/**
 * Whether a server-side model is configured. Checked once per mount; the UI
 * only offers model generation when this comes back ready.
 */
export function useModel(): ModelStatus & { checking: boolean } {
  const [state, setState] = useState<ModelStatus & { checking: boolean }>({
    ready: false,
    model: "",
    checking: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    void checkModel(controller.signal).then((status) => {
      if (controller.signal.aborted) return;
      setState({ ...status, checking: false });
    });
    return () => controller.abort();
  }, []);

  return state;
}
