import { useEffect, useState } from "react";
import {
  createForumPost,
  getPublishedPosts,
  getSessionUser,
  signInWithEmail,
  toggleLike,
  signOut,
  subscribeToAuthState,
} from "../lib/forum";
import type { ForumPost } from "../types/forum";

export function Forum() {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [user, setUser] = useState<{ id: string; email?: string | null } | null>(null);
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("General");
  const [anonymous, setAnonymous] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    } catch {
      setUser(null);
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

  async function handleLogin() {
    if (!email.trim()) {
      setError("Please enter an email.");
      return;
    }

    try {
      setError(null);
      setMessage(null);
      await signInWithEmail(email.trim());
      setMessage("Check your email for the sign-in link.");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown sign-in error";
      setError(`${detail}. Check Auth > Providers > Email and Authentication > URL Configuration.`);
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
        visibility: "public",
        anonymous: !user || anonymous,
        author_name: authorName.trim(),
      });
      setTitle("");
      setContent("");
      setCategory("General");
      setAuthorName("");
      setAnonymous(true);
      setMessage(user ? "Prompt published to the forum." : "Anonymous prompt published to the forum.");
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the post.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      setError(null);
      await signOut();
      setUser(null);
      setMessage("Signed out.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed.");
    }
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
      </div>

      <div className="panel-body">
        {!user ? (
          <div className="forum-auth-box">
            <p>Sign in to publish as yourself, or post anonymously without an account.</p>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button className="btn btn-ghost" onClick={() => void handleLogin()}>
              Send sign-in link
            </button>
          </div>
        ) : (
          <div className="forum-compose">
            <p>Signed in as {user.email ?? "your account"}</p>
            <button className="btn btn-ghost" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>
        )}

        {!user && (
          <div className="forum-compose">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(event) => setAnonymous(event.target.checked)}
              />
              Post anonymously
            </label>

            <input
              className="input"
              placeholder="Display name (optional)"
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
            />
          </div>
        )}

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
          <div className="forum-actions">
            <button
              className="btn btn-primary"
              onClick={() => void handleCreatePost()}
              disabled={loading}
            >
              {loading ? "Publishing…" : user ? "Publish to forum" : "Publish anonymously"}
            </button>
          </div>
        </div>

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
                  <span>
                    {post.author_name ?? post.profiles?.display_name ?? "Anonymous"}
                  </span>
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
      </div>
    </section>
  );
}
