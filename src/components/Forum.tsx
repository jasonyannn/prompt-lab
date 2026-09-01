import { useEffect, useState } from "react";
import {
  createForumPost,
  getCurrentProfile,
  getAuthorPosts,
  getAuthorProfile,
  getMyPosts,
  getPublishedPosts,
  getPublicProfileName,
  getSessionUser,
  toggleLike,
  subscribeToAuthState,
  updateCurrentProfile,
} from "../lib/forum";
import type { AuthorProfile, ForumPost, PostVisibility } from "../types/forum";

export function Forum() {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [user, setUser] = useState<{ id: string; email?: string | null } | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("General");
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  /** null = the public feed; otherwise we are looking at one author. */
  const [viewing, setViewing] = useState<AuthorProfile | null>(null);
  const [viewingPosts, setViewingPosts] = useState<ForumPost[]>([]);
  const [viewingSelf, setViewingSelf] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    void loadPosts();
    void refreshUser();

    const unsubscribe = subscribeToAuthState((nextUser) => {
      setUser(nextUser);
      setAnonymous(false);
      if (nextUser) {
        setMessage("Signed in successfully.");
      }
    });

    return () => unsubscribe();
  }, []);

  async function refreshUser() {
    try {
      const nextUser = await getSessionUser();
      setUser(nextUser);

      if (nextUser) {
        const profile = await getCurrentProfile();
        setProfileDisplayName(profile?.display_name ?? "");
      } else {
        setProfileDisplayName("");
      }
    } catch {
      setUser(null);
      setProfileDisplayName("");
    }
  }

  async function handleSaveProfile() {
    if (!user) {
      setProfileError("Sign in first to change your display name.");
      return;
    }

    try {
      setSavingProfile(true);
      setProfileError(null);
      const profile = await updateCurrentProfile({ display_name: profileDisplayName });
      setProfileDisplayName(profile.display_name ?? "");
      setMessage(`Display name updated: ${getPublicProfileName(profile)}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not update your profile.";
      setProfileError(message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function loadPosts() {
    try {
      const next = await getPublishedPosts();
      setPosts(next);
      setError(null);
    } catch (err) {
      console.error(err);
      const detail = err instanceof Error ? err.message : "Unknown Supabase error";
      setError(
        `Forum fetch failed. ${detail}. Check that the forum_posts table exists and the Supabase project is connected.`
      );
    }
  }

  async function handleCreatePost() {
    if (!title.trim() || !content.trim()) {
      setError("Title and prompt are required.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await createForumPost({
        title,
        content,
        category,
        tags: [],
        visibility: !user || anonymous ? "public" : visibility,
        anonymous: !user || anonymous,
      });
      setTitle("");
      setContent("");
      setCategory("General");
      setAnonymous(true);
      const wasPrivate = user && !anonymous && visibility === "private";
      setMessage(
        wasPrivate
          ? "Saved as a private prompt. Only you can see it."
          : user
            ? "Prompt published to the forum."
            : "Anonymous prompt published to the forum."
      );
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the post.");
    } finally {
      setLoading(false);
    }
  }

  async function openProfile(authorId: string, self = false) {
    setProfileLoading(true);
    setError(null);
    try {
      const [profile, authored] = await Promise.all([
        getAuthorProfile(authorId),
        self ? getMyPosts() : getAuthorPosts(authorId),
      ]);
      setViewing(profile);
      setViewingPosts(authored);
      setViewingSelf(self);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  function closeProfile() {
    setViewing(null);
    setViewingPosts([]);
    setViewingSelf(false);
  }

  async function handleCopyPrompt(post: ForumPost) {
    try {
      await navigator.clipboard.writeText(post.content);
      setCopiedPostId(post.id);
      setMessage("Prompt copied to clipboard.");
      window.setTimeout(() => {
        setCopiedPostId((current) => (current === post.id ? null : current));
      }, 1200);
    } catch {
      setError("Clipboard access failed in this browser.");
    }
  }

  async function handleLike(post: ForumPost) {
    if (!user) {
      setError("Please sign in to like a post.");
      return;
    }

    try {
      setError(null);
      const result = await toggleLike(post.id);
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id ? { ...item, like_count: result.count, usage_count: result.count } : item
        )
      );
      setMessage(result.liked ? "Post liked." : "Like removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not like the post.");
    }
  }

  return (
    <section className="panel forum-panel">
      <div className="panel-head">
        <h2>Forum</h2>
        <div className="topbar-spacer" />
        {user && !viewing && (
          <button className="btn btn-ghost" onClick={() => void openProfile(user.id, true)}>
            My prompts
          </button>
        )}
      </div>

      <div className="panel-body">
        {!viewing && (
        <div className="forum-identity">
          {user ? (
            <p>
              Posting as <strong>{user.email ?? "your account"}</strong>. Sign out
              from the top bar.
            </p>
          ) : (
            <>
              <p>
                You are posting anonymously. To publish under your name, sign in
                from the <a href="#/">home page</a>.
              </p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(event) => setAnonymous(event.target.checked)}
                />
                Post anonymously
              </label>
            </>
          )}
        </div>
        )}

        {!viewing && (
        <div className="forum-compose">

          <input
            className="input"
            placeholder="Prompt title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            className="input"
            placeholder="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
          <textarea
            className="textarea"
            placeholder="Paste or write the full prompt…"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          {user && !anonymous && (
            <div className="visibility-row" role="group" aria-label="Who can see this prompt">
              <button
                type="button"
                className={visibility === "public" ? "is-active" : ""}
                aria-pressed={visibility === "public"}
                onClick={() => setVisibility("public")}
              >
                Public
              </button>
              <button
                type="button"
                className={visibility === "private" ? "is-active" : ""}
                aria-pressed={visibility === "private"}
                onClick={() => setVisibility("private")}
              >
                Private
              </button>
              <small>
                {visibility === "private"
                  ? "Only you will see this. It stays out of the forum."
                  : "Anyone can find this in the forum."}
              </small>
            </div>
          )}

          <div className="forum-actions">
            <button
              className="btn btn-primary"
              onClick={() => void handleCreatePost()}
              disabled={loading}
            >
              {loading
                ? "Saving…"
                : user && !anonymous && visibility === "private"
                  ? "Save privately"
                  : user
                    ? "Publish to forum"
                    : "Publish anonymously"}
            </button>
          </div>
        </div>
        )}

        {error && (
          <p className="notice is-bad">
            <strong>Forum error</strong>
            <span>{error}</span>
          </p>
        )}
        {message && (
          <p className="notice">
            <strong>Update</strong>
            <span>{message}</span>
          </p>
        )}

        {viewing ? (
          <div className="profile-view">
            <div className="profile-head">
              <button className="btn btn-ghost" onClick={closeProfile}>
                ← Back to forum
              </button>
              <span className="profile-kicker">
                {viewingSelf ? "Your profile" : "Author profile"}
              </span>
            </div>

            <div className="profile-card">
              <span className="profile-avatar" aria-hidden="true">
                {(viewing.display_name ?? "A").slice(0, 2).toUpperCase()}
              </span>
              <div className="profile-identity">
                <strong>{viewing.display_name?.trim() || "Anonymous"}</strong>
                {viewing.created_at && (
                  <small>
                    Joined {new Date(viewing.created_at).toLocaleDateString()}
                  </small>
                )}
              </div>
              <dl className="profile-stats">
                <div>
                  <dt>Public prompts</dt>
                  <dd>{viewing.public_post_count}</dd>
                </div>
                {viewingSelf && viewing.private_post_count !== undefined && (
                  <div>
                    <dt>Private</dt>
                    <dd>{viewing.private_post_count}</dd>
                  </div>
                )}
              </dl>
            </div>

            {viewingSelf && (
              <div className="profile-edit">
                <label className="label" htmlFor="display-name">
                  Your display name
                </label>
                <p className="profile-edit-note">
                  This is the name shown on every prompt you publish.
                </p>
                <div className="profile-edit-row">
                  <input
                    id="display-name"
                    className="input"
                    placeholder="Display name"
                    value={profileDisplayName}
                    onChange={(event) => setProfileDisplayName(event.target.value)}
                  />
                  <button
                    className="btn"
                    onClick={() => void handleSaveProfile()}
                    disabled={savingProfile}
                  >
                    {savingProfile ? "Saving…" : "Save"}
                  </button>
                </div>
                {profileError && (
                  <p className="notice is-bad">
                    <strong>Profile error</strong>
                    <span>{profileError}</span>
                  </p>
                )}
              </div>
            )}

            <h3 className="profile-section-title">
              {viewingSelf ? "Your prompts" : "Public prompts"}
            </h3>

            <div className="forum-list">
              {profileLoading ? (
                <p className="empty">Loading prompts…</p>
              ) : viewingPosts.length === 0 ? (
                <p className="empty">
                  {viewingSelf
                    ? "You have not published any prompts yet."
                    : "This author has not published any public prompts yet."}
                </p>
              ) : (
                viewingPosts.map((post) => (
                  <article key={post.id} className="forum-post">
                    <div className="forum-post-head">
                      <strong>{post.title}</strong>
                      <span>{post.category}</span>
                    </div>
                    <div className="forum-post-content">
                      <pre>{post.content}</pre>
                      <button
                        className="copy-button"
                        aria-label="Copy prompt"
                        title="Copy to clipboard"
                        onClick={() => void handleCopyPrompt(post)}
                      >
                        {copiedPostId === post.id ? "✓" : "⧉"}
                      </button>
                    </div>
                    <div className="forum-post-meta">
                      {post.visibility !== "public" ? (
                        <span className="visibility-badge">Private</span>
                      ) : (
                        <span>Public</span>
                      )}
                      <div className="forum-post-tools">
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        ) : (
        <div className="forum-list">
          {posts.length === 0 ? (
            <p className="empty">No published prompts yet.</p>
          ) : (
            posts.map((post) => (
              <article key={post.id} className="forum-post">
                <div className="forum-post-head">
                  <strong>{post.title}</strong>
                  <span>{post.category}</span>
                </div>
                <div className="forum-post-content">
                  <pre>{post.content}</pre>
                  <button
                    className="copy-button"
                    aria-label="Copy prompt"
                    title="Copy to clipboard"
                    onClick={() => void handleCopyPrompt(post)}
                  >
                    {copiedPostId === post.id ? "✓" : "⧉"}
                  </button>
                </div>
                <div className="forum-post-meta">
                  {post.author_id ? (
                    <button
                      className="author-link"
                      onClick={() => void openProfile(post.author_id as string)}
                      title="View this author's profile"
                    >
                      {getPublicProfileName(post.profiles)}
                    </button>
                  ) : (
                    <span>Anonymous</span>
                  )}
                  <div className="forum-post-tools">
                    <button
                      className="like-button"
                      onClick={() => void handleLike(post)}
                      disabled={!user}
                      title={user ? "Like this post" : "Sign in to like this post"}
                      aria-label="Like post"
                    >
                      ♥ {(post.like_count ?? post.usage_count ?? 0)}
                    </button>
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        )}
      </div>
    </section>
  );
}
