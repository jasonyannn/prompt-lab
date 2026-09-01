import { useCallback, useEffect, useState } from "react";
import { settingsStore, type Settings } from "../lib/settingsStore";
import { translate, type TranslationKey } from "../lib/i18n";

/**
 * Preferences plus the translator, since almost everything that reads a
 * setting also needs to render a label in the chosen language.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => settingsStore.getAll());

  useEffect(() => {
    const refresh = () => setSettings(settingsStore.getAll());
    window.addEventListener(settingsStore.eventName, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(settingsStore.eventName, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translate(settings.language, key),
    [settings.language]
  );

  const set = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) =>
      settingsStore.set(key, value),
    []
  );

  return { settings, set, reset: settingsStore.reset, t };
}
