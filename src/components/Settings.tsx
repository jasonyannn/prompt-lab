import { useState } from "react";
import { useSettings } from "../hooks/useSettings";
import { LANGUAGES } from "../lib/i18n";
import type {
  ContrastMode,
  FontChoice,
  LanguageCode,
  MotionMode,
  TextSize,
} from "../lib/settingsStore";

type Props = {
  onExport: () => void;
  onImport: () => void;
};

/** A labelled group of mutually exclusive options. */
function Choice<T extends string>({
  label,
  note,
  value,
  options,
  onChange,
}: {
  label: string;
  note: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <strong>{label}</strong>
        <small>{note}</small>
      </div>
      <div className="setting-control" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "is-active" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A single on/off preference. */
function Toggle({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <strong>{label}</strong>
        <small>{note}</small>
      </div>
      <label className="setting-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span aria-hidden="true" />
      </label>
    </div>
  );
}

export function Settings({ onExport, onImport }: Props) {
  const { settings, set, reset, t } = useSettings();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="settings-layout">
      <header className="settings-hero">
        <span className="eyebrow studio-eyebrow">{t("nav.settings")}</span>
        <h2>
          {t("settings.title")}
          <br />
          <em>{t("settings.subtitle")}</em>
        </h2>
      </header>

      <section className="panel settings-panel" aria-labelledby="a11y-heading">
        <div className="panel-head">
          <h2 id="a11y-heading">{t("settings.accessibility")}</h2>
        </div>
        <div className="panel-body">
          <p className="settings-note">{t("settings.accessibilityNote")}</p>

          <Choice<TextSize>
            label={t("settings.textSize")}
            note={t("settings.textSizeNote")}
            value={settings.textSize}
            onChange={(next) => set("textSize", next)}
            options={[
              { value: "default", label: t("settings.size.default") },
              { value: "large", label: t("settings.size.large") },
              { value: "xlarge", label: t("settings.size.xlarge") },
            ]}
          />

          <Choice<ContrastMode>
            label={t("settings.contrast")}
            note={t("settings.contrastNote")}
            value={settings.contrast}
            onChange={(next) => set("contrast", next)}
            options={[
              { value: "default", label: t("settings.contrast.default") },
              { value: "high", label: t("settings.contrast.high") },
            ]}
          />

          <Choice<MotionMode>
            label={t("settings.motion")}
            note={t("settings.motionNote")}
            value={settings.motion}
            onChange={(next) => set("motion", next)}
            options={[
              { value: "default", label: t("settings.motion.default") },
              { value: "reduced", label: t("settings.motion.reduced") },
            ]}
          />

          <Choice<FontChoice>
            label={t("settings.font")}
            note={t("settings.fontNote")}
            value={settings.font}
            onChange={(next) => set("font", next)}
            options={[
              { value: "default", label: t("settings.font.default") },
              { value: "dyslexic", label: t("settings.font.dyslexic") },
            ]}
          />

          <Toggle
            label={t("settings.focusRing")}
            note={t("settings.focusRingNote")}
            checked={settings.focusRing}
            onChange={(next) => set("focusRing", next)}
          />

          <Toggle
            label={t("settings.underlineLinks")}
            note={t("settings.underlineLinksNote")}
            checked={settings.underlineLinks}
            onChange={(next) => set("underlineLinks", next)}
          />
        </div>
      </section>

      <section className="panel settings-panel" aria-labelledby="lang-heading">
        <div className="panel-head">
          <h2 id="lang-heading">{t("settings.language")}</h2>
        </div>
        <div className="panel-body">
          <p className="settings-note">{t("settings.languageNote")}</p>
          <div className="language-grid">
            {LANGUAGES.map((language) => (
              <button
                key={language.code}
                className={`language-card${settings.language === language.code ? " is-active" : ""}`}
                aria-pressed={settings.language === language.code}
                lang={language.code}
                onClick={() => set("language", language.code as LanguageCode)}
              >
                <strong>{language.label}</strong>
                <small>{language.english}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel settings-panel" aria-labelledby="general-heading">
        <div className="panel-head">
          <h2 id="general-heading">{t("settings.general")}</h2>
        </div>
        <div className="panel-body">
          <Toggle
            label={t("settings.confirmDestructive")}
            note={t("settings.confirmDestructiveNote")}
            checked={settings.confirmDestructive}
            onChange={(next) => set("confirmDestructive", next)}
          />
        </div>
      </section>

      <section className="panel settings-panel" aria-labelledby="data-heading">
        <div className="panel-head">
          <h2 id="data-heading">{t("settings.data")}</h2>
        </div>
        <div className="panel-body">
          <p className="settings-note">{t("settings.dataNote")}</p>
          <div className="settings-actions">
            <button className="btn" onClick={onExport}>
              {t("settings.export")}
            </button>
            <button className="btn" onClick={onImport}>
              {t("settings.import")}
            </button>
            <div className="topbar-spacer" />
            <button
              className="btn btn-ghost"
              onClick={() => {
                reset();
                setNotice(t("settings.resetDone"));
              }}
            >
              {t("settings.reset")}
            </button>
          </div>
          {notice && (
            <p className="settings-note is-good" role="status">
              {notice}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
