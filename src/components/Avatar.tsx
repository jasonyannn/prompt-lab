import { useState } from "react";

export function Avatar({ url, name, className = "account-avatar" }: {
  url?: string | null;
  name: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className={`${className} avatar-image`} aria-hidden="true">
      {url && url !== failedUrl ? (
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      ) : name.replace(/^@/, "").slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
