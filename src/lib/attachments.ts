export type AttachmentKind = "document" | "image";

export type UserAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  lastModified: number;
  kind: AttachmentKind;
  /** Extracted document text. Images deliberately remain binary. */
  text?: string;
  /** Browser-safe preview for images. */
  dataUrl?: string;
  /** Raw base64 expected by Ollama's `images` message field. */
  base64?: string;
  truncated?: boolean;
};

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024 * 1024;
const MAX_DOCUMENT_CHARS = 30_000;

/**
 * Attachment pickers register their current files here so the page's WebMCP
 * agent can inspect the same source material the user sees in the UI.
 */
const attachmentScopes = new Map<string, UserAttachment[]>();

export function setAttachmentScope(scopeId: string, attachments: UserAttachment[]) {
  attachmentScopes.set(scopeId, attachments);
}

export function clearAttachmentScope(scopeId: string) {
  attachmentScopes.delete(scopeId);
}

export function getVisibleAttachments() {
  const unique = new Map<string, UserAttachment>();
  for (const attachments of attachmentScopes.values()) {
    for (const attachment of attachments) unique.set(attachment.id, attachment);
  }
  return [...unique.values()];
}

export const ATTACHMENT_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".rtf",
].join(",");

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "html",
  "htm",
  "xml",
  "rtf",
]);

function extension(name: string) {
  return name.toLowerCase().split(".").pop() ?? "";
}

function cleanText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\0/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function capText(value: string) {
  const cleaned = cleanText(value);
  if (cleaned.length <= MAX_DOCUMENT_CHARS) {
    return { text: cleaned, truncated: false };
  }
  return {
    text: `${cleaned.slice(0, MAX_DOCUMENT_CHARS).trimEnd()}\n\n[Document truncated by Prompt Lab]`,
    truncated: true,
  };
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function readPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const pages: string[] = [];
  let length = 0;
  let truncated = false;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) {
      const labelled = `[Page ${pageNumber}]\n${pageText}`;
      pages.push(labelled);
      length += labelled.length;
    }
    page.cleanup();
    if (length >= MAX_DOCUMENT_CHARS) {
      truncated = pageNumber < document.numPages;
      break;
    }
  }

  await document.destroy();
  const result = capText(pages.join("\n\n"));
  return { text: result.text, truncated: truncated || result.truncated };
}

async function readDocx(file: File) {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return capText(result.value);
}

function assertReadableDocument(text: string, name: string) {
  if (!text.trim()) {
    throw new Error(
      `${name} contains no readable text. For a scanned document, attach page images or run OCR first.`
    );
  }
}

export async function readAttachment(file: File): Promise<UserAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is larger than the 10 MB per-file limit.`);
  }

  const fileExtension = extension(file.name);
  const base = {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
  };

  if (IMAGE_TYPES.has(file.type)) {
    const dataUrl = await readDataUrl(file);
    return {
      ...base,
      kind: "image",
      dataUrl,
      base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    };
  }

  let extracted: { text: string; truncated: boolean };
  if (file.type === "application/pdf" || fileExtension === "pdf") {
    extracted = await readPdf(file);
  } else if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileExtension === "docx"
  ) {
    extracted = await readDocx(file);
  } else if (TEXT_EXTENSIONS.has(fileExtension) || file.type.startsWith("text/")) {
    extracted = capText(await file.text());
  } else {
    throw new Error(
      `${file.name} is not supported. Attach PDF, DOCX, TXT, Markdown, CSV, JSON, HTML, XML, RTF, PNG, JPEG, WebP, or GIF.`
    );
  }

  assertReadableDocument(extracted.text, file.name);
  return {
    ...base,
    kind: "document",
    text: extracted.text,
    truncated: extracted.truncated,
  };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Builds source context for a generated prompt or local-model message.
 * Uploaded text is explicitly delimited and treated as evidence, not instructions.
 */
export function attachmentContext(
  attachments: UserAttachment[],
  maxCharacters = 60_000
) {
  if (attachments.length === 0) return "";

  const sections: string[] = [];
  let remaining = maxCharacters;
  for (const attachment of attachments) {
    if (remaining <= 0) break;
    if (attachment.kind === "image") {
      const line = `[Attached image: ${attachment.name} · ${attachment.mimeType} · ${formatBytes(attachment.size)}]`;
      sections.push(line);
      remaining -= line.length;
      continue;
    }

    const header = `--- BEGIN ATTACHED DOCUMENT: ${attachment.name} ---`;
    const footer = `--- END ATTACHED DOCUMENT: ${attachment.name} ---`;
    const available = Math.max(0, remaining - header.length - footer.length - 2);
    const text = (attachment.text ?? "").slice(0, available);
    sections.push(`${header}\n${text}\n${footer}`);
    remaining -= header.length + text.length + footer.length + 2;
  }

  if (attachments.some((attachment) => attachment.kind === "document") && remaining <= 0) {
    sections.push("[Additional attachment content omitted to fit the context limit]");
  }
  return sections.join("\n\n");
}
