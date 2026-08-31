import { useCallback, useEffect, useState } from "react";
import { categoryStore } from "../lib/categoryStore";

export function useCategories(): {
  categories: string[];
  refresh: () => void;
} {
  const [categories, setCategories] = useState<string[]>(() =>
    categoryStore.getAll()
  );
  const refresh = useCallback(() => setCategories(categoryStore.getAll()), []);

  useEffect(() => {
    window.addEventListener(categoryStore.eventName, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(categoryStore.eventName, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { categories, refresh };
}
