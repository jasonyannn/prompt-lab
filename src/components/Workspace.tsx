import { Avatar } from "./Avatar";
import { uploadProfilePhoto, removeProfilePhoto } from "../lib/profilePhoto";
import { validateProfilePhoto, type CropView } from "../lib/avatarImage";
import { PhotoCropper } from "./PhotoCropper";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrompts } from "../hooks/usePrompts";
import { useAgents } from "../hooks/useAgents";
import { useCategories } from "../hooks/useCategories";
import { useAuth } from "../hooks/useAuth";
import { useSettings } from "../hooks/useSettings";
import { Settings } from "./Settings";
import { promptStore } from "../lib/promptStore";
import { agentStore } from "../lib/agentStore";
import { categoryStore } from "../lib/categoryStore";
import { WebMCPStatus } from "./WebMCPStatus";
import { RightRail } from "./RightRail";
import { PromptList, type SortKey } from "./PromptList";
import { PromptDetail } from "./PromptDetail";
import { NewPromptForm } from "./NewPromptForm";
import { PromptStudio } from "./PromptStudio";
import { Discover } from "./Discover";
import { Forum } from "./Forum";
import { getCurrentProfile, updateCurrentProfile, getPublicProfileName } from "../lib/forum";
import type { WebMCPState } from "../hooks/useWebMCP";
import type { RemoteMCPState } from "../hooks/useRemoteMCP";

type Props = {
  webmcp: WebMCPState;
  remoteMcp: RemoteMCPState;
  onHome: () => void;
};

export function Workspace({ webmcp, remoteMcp, onHome }: Props) {
  const { ready, supported, tools, activity, clearActivity } = webmcp;

  const { prompts } = usePrompts();
  const { agents } = useAgents();
  const { categories: savedCategories } = useCategories();
  const { user, signOut } = useAuth();
  const { t } = useSettings();
  const [view, setView] = useState<"discover" | "library" | "studio" | "forum" | "settings">(
    "discover"
  );
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [accountAvatar, setAccountAvatar] = useState<string | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [accountUsername, setAccountUsername] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [agentFilter, setAgentFilter] = useState("All");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(
    () => prompts[0]?.id ?? null
  );
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Saved categories stay selectable even before a prompt lands in them.
  const categories = useMemo(
    () =>
      [
        ...new Set([
          ...savedCategories,
          ...prompts.map((prompt) => prompt.category),
        ]),
      ].sort(),
    [prompts, savedCategories]
  );

  const visible = useMemo(() => {
    // Every typed word must appear somewhere, in any order, so "letter cover"
    // finds "Cover letter". Substring matching keeps a half-typed word useful.
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    const filtered = prompts.filter((prompt) => {
      if (category !== "All" && prompt.category !== category) return false;
      if (agentFilter !== "All" && prompt.agentId !== agentFilter) return false;
      if (words.length === 0) return true;
      const haystack = [prompt.title, prompt.content, prompt.category]
        .join(" ")
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "used":
          return b.usageCount - a.usageCount;
        case "rated":
          return (b.rating ?? 0) - (a.rating ?? 0);
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [prompts, query, category, agentFilter, sort]);

  // Keep a valid selection when agents create or delete prompts under us.
  useEffect(() => {
    if (prompts.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !prompts.some((prompt) => prompt.id === selectedId)) {
      setSelectedId(prompts[0].id);
    }
  }, [prompts, selectedId]);

  const selected = prompts.find((prompt) => prompt.id === selectedId) ?? null;
  const publicName = getPublicProfileName({ display_name: accountDisplayName, username: accountUsername });

  useEffect(() => {
    if (!user) {
      setAccountDisplayName("");
      setAccountUsername(null);
      setAccountAvatar(null);
      setAccountMessage(null);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const profile = await getCurrentProfile();
        if (!active) return;
        setAccountDisplayName(profile?.display_name ?? "");
        setAccountUsername(profile?.username ?? null);
        setAccountAvatar(profile?.avatar_url ?? null);
        setAccountError(null);
      } catch {
        if (!active) return;
        setAccountDisplayName("");
        setAccountUsername(null);
      }
    })();
    return () => { active = false; };
  }, [user, view]);

  /** Validate up front so a bad file errors on the page, not inside the cropper. */
  function chooseProfilePhoto(file: File) {
    setPhotoError(null);
    setPhotoMessage(null);
    try {
      validateProfilePhoto(file);
      setCropFile(file);
    } catch (caught) {
      setPhotoError(caught instanceof Error ? caught.message : "Could not read that photo.");
    }
  }

  async function handleProfilePhoto(file?: File, crop?: CropView) {
    setSavingPhoto(true);
    setPhotoError(null);
    setPhotoMessage(null);
    try {
      const profile = file ? await uploadProfilePhoto(file, crop) : await removeProfilePhoto();
      setCropFile(null);
      setAccountAvatar(profile.avatar_url ?? null);
      setPhotoMessage(file ? "Photo updated" : "Photo removed");
    } catch (caught) {
      setPhotoError(caught instanceof Error ? caught.message : "Could not update your photo.");
    } finally {
      setSavingPhoto(false);
    }
  }

  async function handleSaveAccountProfile() {
    if (!user) {
      setAccountError("Sign in first to change your display name.");
      return;
    }

    try {
      setSavingAccount(true);
      setAccountError(null);
      const profile = await updateCurrentProfile({ display_name: accountDisplayName });
      setAccountDisplayName(profile.display_name ?? "");
      setAccountMessage(`Display name saved: ${getPublicProfileName(profile)}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not update your display name.";
      setAccountError(message);
    } finally {
      setSavingAccount(false);
    }
  }

  function exportLibrary() {
    const blob = new Blob([JSON.stringify({
      version: 2,
      agents: agentStore.getAll(),
      categories: categoryStore.getAll(),
      prompts: promptStore.getAll(),
    }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prompt-lab.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importLibrary(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const entries = Array.isArray(parsed) ? parsed : parsed?.prompts;
      if (!Array.isArray(entries)) throw new Error("missing prompts");

      if (!Array.isArray(parsed) && Array.isArray(parsed.agents)) {
        const validAgents = parsed.agents.filter(
          (entry: unknown) =>
            typeof (entry as { id?: unknown })?.id === "string" &&
            typeof (entry as { name?: unknown })?.name === "string" &&
            typeof (entry as { role?: unknown })?.role === "string" &&
            typeof (entry as { instructions?: unknown })?.instructions === "string"
        );
        agentStore.replaceAll(validAgents);
      }

      if (!Array.isArray(parsed) && Array.isArray(parsed.categories)) {
        categoryStore.replaceAll(
          parsed.categories.filter(
            (entry: unknown) => typeof entry === "string"
          )
        );
      }

      for (const entry of entries) {
        if (typeof entry?.title === "string" && typeof entry?.content === "string") {
          if (typeof entry.category === "string") categoryStore.ensure(entry.category);
          promptStore.create({
            title: entry.title,
            content: entry.content,
            category: typeof entry.category === "string" ? entry.category : undefined,
            agentId: typeof entry.agentId === "string" ? entry.agentId : undefined,
          });
        }
      }
    } catch {
      window.alert("That file isn't a Prompt Lab export.");
    }
  }

  function openInLibrary(id: string) {
    setSelectedId(id);
    setCreating(false);
    setView("library");
  }

  const accountPanel = (
    <>
          {!user ? (
            <div className="panel account-signed-out">
              <p>Sign in to manage your public profile.</p>
              <button className="btn btn-primary" onClick={onHome}>Go to sign in</button>
            </div>
          ) : (
            <div className="panel account-panel">
              <div className="account-identity">
                <Avatar url={accountAvatar} name={publicName} />
                <div>
                  <span className="account-label">Account email</span>
                  <p>{user.email ?? "Signed-in account"}</p>
                  <span className="account-label">
                    {accountUsername ? `@${accountUsername}` : "No username yet. Choose one below."}
                  </span>
                </div>
              </div>
              <div className="account-photo-controls">
                <div>
                  <strong>Profile photo</strong>
                  <p>Public on your profile and forum posts. JPG, PNG, or WebP up to 5 MB; cropped to a square.</p>
                </div>
                <div className="account-photo-actions">
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) chooseProfilePhoto(file);
                    }} />
                  <button className="btn btn-quiet" disabled={savingPhoto}
                    onClick={() => photoInputRef.current?.click()}>
                    {savingPhoto ? "Updating photo…" : accountAvatar ? "Change photo" : "Upload photo"}
                  </button>
                  {accountAvatar && <button className="btn btn-quiet" disabled={savingPhoto}
                    onClick={() => void handleProfilePhoto()}>Remove photo</button>}
                </div>
                <div role="status" aria-live="polite">
                  {photoError && <span className="account-feedback is-bad">{photoError}</span>}
                  {photoMessage && <span className="account-feedback is-good">{photoMessage}</span>}
                </div>
              </div>
              <div className="account-content">
                <form className="account-form" onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveAccountProfile();
                }}>
                  <label htmlFor="account-display-name">Display name</label>
                  <p id="account-name-help">
                    The name shown alongside your forum posts. {accountUsername
                      ? "Leave blank to use your username."
                      : "Leave blank to appear as Anonymous."}
                  </p>
                  <input
                    id="account-display-name"
                    className="input"
                    autoComplete="nickname"
                    aria-describedby="account-name-help"
                    placeholder="Your public name"
                    value={accountDisplayName}
                    disabled={savingAccount}
                    onChange={(event) => {
                      setAccountDisplayName(event.target.value);
                      setAccountMessage(null);
                      setAccountError(null);
                    }}
                  />
                  <div className="account-save-row">
                    <button className="btn btn-primary" type="submit" disabled={savingAccount}>
                      {savingAccount ? "Saving…" : "Save changes"}
                    </button>
                    <div aria-live="polite" role="status">
                      {accountMessage && <span className="account-feedback is-good">Changes saved</span>}
                      {accountError && <span className="account-feedback is-bad">{accountError}</span>}
                    </div>
                  </div>
                </form>
                <aside className="account-preview" aria-label="Forum name preview">
                  <span className="account-label">Forum preview</span>
                  <div className="account-preview-byline">
                    <Avatar url={accountAvatar} name={publicName} className="account-avatar account-avatar-small" />
                    <div>
                      <strong>{publicName}</strong>
                      <span>Post author</span>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          )}
    </>
  );

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        {t("nav.skipToContent")}
      </a>
      <header className="topbar">
        <button className="brand brand-button" onClick={onHome}>
          <span className="mark" aria-hidden="true" />
          <h1>Prompt Lab</h1>
          <span className="tagline">agent-ready prompt library</span>
        </button>

        <nav className="workspace-nav" aria-label="Workspace sections">
          <button
            className={view === "discover" ? "is-active" : ""}
            onClick={() => setView("discover")}
          >
            {t("nav.discover")}
          </button>
          <button
            className={view === "library" ? "is-active" : ""}
            onClick={() => setView("library")}
          >
            {t("nav.library")}
          </button>
          <button
            className={view === "studio" ? "is-active" : ""}
            onClick={() => setView("studio")}
          >
            {t("nav.studio")}
          </button>
          <button
            className={view === "forum" ? "is-active" : ""}
            onClick={() => setView("forum")}
          >
            {t("nav.forum")}
          </button>
          <button
            className={view === "settings" ? "is-active" : ""}
            onClick={() => setView("settings")}
          >
            {t("nav.settings")}
          </button>
        </nav>

        <div className="topbar-spacer" />

        {/* Export and Import live in Settings; this input backs its Import button. */}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importLibrary(file);
            event.target.value = "";
          }}
        />

        {user && (
          <div className="account-chip">
            <span title={accountUsername ? `@${accountUsername}` : "Signed in"}>
              {accountUsername ? `@${accountUsername}` : "Signed in"}
            </span>
            <button className="btn btn-ghost" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        )}

        <WebMCPStatus
          ready={ready}
          supported={supported}
          toolCount={tools.length}
          remoteReady={remoteMcp.ready}
          remoteToolCount={remoteMcp.tools.length}
        />
      </header>

      <main id="main-content" tabIndex={-1}>
      {view === "settings" ? (
        <Settings
          account={accountPanel}
          onExport={exportLibrary}
          onImport={() => fileRef.current?.click()}
        />
      ) : view === "discover" ? (
        <Discover onOpenPrompt={openInLibrary} />
      ) : view === "studio" ? (
        <PromptStudio onOpenPrompt={openInLibrary} />
      ) : view === "forum" ? (
        <Forum />
      ) : <div className="columns">
        <PromptList
          prompts={visible}
          categories={categories}
          agents={agents}
          activeCategory={category}
          activeAgent={agentFilter}
          sort={sort}
          selectedId={selectedId}
          query={query}
          totalCount={prompts.length}
          onQueryChange={setQuery}
          onCategoryChange={setCategory}
          onAgentChange={setAgentFilter}
          onSortChange={setSort}
          onSelect={(id) => {
            setSelectedId(id);
            setCreating(false);
          }}
          onNew={() => setCreating(true)}
        />

        {creating ? (
          <NewPromptForm
            agents={agents}
            onCreated={(id) => {
              setSelectedId(id);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : selected ? (
          <PromptDetail
            key={selected.id}
            prompt={selected}
            agents={agents}
          />
        ) : (
          <section className="panel detail-panel">
            <div className="panel-head">
              <h2>Prompt</h2>
            </div>
            <p className="empty">
              Your library is empty. Create a prompt, or ask an agent to call{" "}
              <code>create_prompt</code>.
            </p>
          </section>
        )}

        <RightRail
          activity={activity}
          tools={tools}
          onClear={clearActivity}
          agents={agents}
        />
      </div>}
      </main>
      {cropFile && (
        <PhotoCropper
          file={cropFile}
          saving={savingPhoto}
          error={photoError}
          onCancel={() => setCropFile(null)}
          onSave={(crop) => void handleProfilePhoto(cropFile, crop)}
        />
      )}
    </div>
  );
}
