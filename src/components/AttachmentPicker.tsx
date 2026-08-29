import { useEffect, useRef, useState } from "react";
import {
  ATTACHMENT_ACCEPT,
  clearAttachmentScope,
  formatBytes,
  MAX_ATTACHMENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  readAttachment,
  setAttachmentScope,
  type UserAttachment,
} from "../lib/attachments";

type Props = {
  attachments: UserAttachment[];
  onChange: (attachments: UserAttachment[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function AttachmentPicker({
  attachments,
  onChange,
  disabled = false,
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scopeId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = scopeId.current;
    setAttachmentScope(id, attachments);
    return () => clearAttachmentScope(id);
  }, [attachments]);

  async function addFiles(files: File[]) {
    if (disabled || busy || files.length === 0) return;
    setBusy(true);
    setError(null);

    const next = [...attachments];
    const errors: string[] = [];
    let totalBytes = next.reduce((sum, attachment) => sum + attachment.size, 0);

    for (const file of files) {
      if (next.length >= MAX_ATTACHMENTS) {
        errors.push(`You can attach up to ${MAX_ATTACHMENTS} files at a time.`);
        break;
      }
      if (
        next.some(
          (attachment) =>
            attachment.name === file.name &&
            attachment.size === file.size &&
            attachment.lastModified === file.lastModified
        )
      ) {
        errors.push(`${file.name} is already attached.`);
        continue;
      }
      if (totalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        errors.push(`${file.name} would exceed the 24 MB total attachment limit.`);
        continue;
      }

      try {
        const attachment = await readAttachment(file);
        next.push(attachment);
        totalBytes += attachment.size;
      } catch (caught) {
        errors.push(caught instanceof Error ? caught.message : String(caught));
      }
    }

    onChange(next);
    setError(errors.length ? errors.join(" ") : null);
    setBusy(false);
  }

  return (
    <div className={`attachment-picker${compact ? " is-compact" : ""}`}>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={ATTACHMENT_ACCEPT}
        disabled={disabled || busy}
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      <div
        className={`attachment-drop${dragging ? " is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <button
          type="button"
          className="btn attachment-button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy || attachments.length >= MAX_ATTACHMENTS}
        >
          <span aria-hidden="true">＋</span>
          {busy ? "Reading…" : "Attach files"}
        </button>
        <span>
          {compact
            ? "PDF, DOCX, text, or images"
            : "Drop documents or images here · PDF, DOCX, text, PNG, JPEG, WebP, GIF"}
        </span>
      </div>

      {attachments.length > 0 && (
        <ul className="attachment-list" aria-label="Attached files">
          {attachments.map((attachment) => (
            <li className="attachment-item" key={attachment.id}>
              {attachment.kind === "image" && attachment.dataUrl ? (
                <img src={attachment.dataUrl} alt="" />
              ) : (
                <span className="attachment-file-icon" aria-hidden="true">DOC</span>
              )}
              <span className="attachment-copy">
                <strong title={attachment.name}>{attachment.name}</strong>
                <small>
                  {formatBytes(attachment.size)} · {attachment.kind}
                  {attachment.truncated ? " · text trimmed" : ""}
                </small>
              </span>
              <button
                type="button"
                className="attachment-remove"
                aria-label={`Remove ${attachment.name}`}
                disabled={disabled}
                onClick={() =>
                  onChange(attachments.filter((item) => item.id !== attachment.id))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="attachment-error" role="alert">{error}</p>}
    </div>
  );
}
