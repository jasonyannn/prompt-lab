import { promptStore } from "./promptStore";
import { supabase } from "./supabase";
import type { AuthorProfile, ForumInsert, ForumPost } from "../types/forum";

export type SessionUser = {
  id: string;
  email?: string | null;
};

export type UserProfile = {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function getPublicProfileName(profile?: { display_name?: string | null } | null) {
  return profile?.display_name?.trim() || "Anonymous";
}

function normalizeForumPosts(data: any[] = []): ForumPost[] {
  return data.map((post) => {
    const total = post.forum_post_like_totals?.[0]?.like_count ?? 0;
    return {
      ...post,
      like_count: total,
      usage_count: total,
    } as ForumPost;
  });
}

export async function getPublishedPosts(): Promise<ForumPost[]> {
  const { data, error } = await supabase
    .from("forum_posts")
    .select(
      "*, profiles:profiles!author_id(display_name), forum_post_like_totals:forum_post_like_totals(post_id, like_count)"
    )
    .eq("status", "published")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (error) {
    const detail = error.message || "Unknown Supabase error";
    throw new Error(`Supabase forum query failed: ${detail}`);
  }

  return normalizeForumPosts(data ?? []);
}

export async function searchForumPosts(
  query?: string,
  category?: string,
  limit = 20
): Promise<ForumPost[]> {
  let request = supabase
    .from("forum_posts")
    .select(
      "*, profiles:profiles!author_id(display_name), forum_post_like_totals:forum_post_like_totals(post_id, like_count)"
    )
    .eq("status", "published");

  if (category) request = request.eq("category", category);
  if (query && query.trim()) {
    const term = query.trim();
    request = request.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
  }

  const { data, error } = await request
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const detail = error.message || "Unknown Supabase error";
    throw new Error(`Supabase forum search failed: ${detail}`);
  }

  return normalizeForumPosts(data ?? []);
}

export async function getForumPostById(postId: string): Promise<ForumPost | null> {
  const { data, error } = await supabase
    .from("forum_posts")
    .select(
      "*, profiles:profiles!author_id(display_name), forum_post_like_totals:forum_post_like_totals(post_id, like_count)"
    )
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message || "Unknown forum lookup error");
  }

  if (!data) return null;
  return normalizeForumPosts([data])[0];
}

export async function getForumCategories(): Promise<{ name: string; count: number }[]> {
  const posts = await getPublishedPosts();
  const counts = new Map<string, number>();
  for (const post of posts) {
    const name = post.category || "General";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

export async function getForumTrendingPosts(limit = 10): Promise<ForumPost[]> {
  const posts = await getPublishedPosts();
  return [...posts]
    .sort((a, b) => Number(b.like_count ?? 0) - Number(a.like_count ?? 0))
    .slice(0, limit);
}

export async function generateForumSummary(postId: string): Promise<{
  id: string;
  title: string;
  summary: string;
  keyPoints: string[];
  suggestedTags: string[];
} | null> {
  const post = await getForumPostById(postId);
  if (!post) return null;

  const text = post.content.trim();
  const preview = text.length > 280 ? `${text.slice(0, 280)}…` : text;
  const keyPoints = [
    post.title,
    ...(post.category ? [`Category: ${post.category}`] : []),
    ...(text.split(/\s+/).slice(0, 8).length > 0 ? [`Core idea: ${text.split(/\s+/).slice(0, 12).join(" ")}`] : []),
  ];

  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const tagCounts = new Map<string, number>();
  for (const word of words) {
    if (word.length < 5) continue;
    tagCounts.set(word, (tagCounts.get(word) ?? 0) + 1);
  }
  const suggestedTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  return {
    id: post.id,
    title: post.title,
    summary: preview,
    keyPoints: keyPoints.slice(0, 3),
    suggestedTags,
  };
}

export async function saveForumPostToLibrary(postId: string, category?: string) {
  const post = await getForumPostById(postId);
  if (!post) {
    return { saved: false, reason: "not_found" as const };
  }

  const existing = promptStore
    .getAll()
    .find(
      (prompt) =>
        prompt.sourceId === post.id ||
        (prompt.title === post.title && prompt.content === post.content)
    );

  if (existing) {
    return { saved: false, alreadySaved: true, prompt: existing };
  }

  const prompt = promptStore.create({
    title: post.title,
    content: post.content,
    category: category ?? post.category ?? "General",
    sourceId: post.id,
  });

  return { saved: true, alreadySaved: false, prompt };
}

export async function getForumPostEngagement(postId: string) {
  const post = await getForumPostById(postId);
  const user = await getSessionUser().catch(() => null);

  let likedByUser = false;
  if (user) {
    const { data, error } = await supabase
      .from("forum_post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error) likedByUser = Boolean(data);
  }

  return {
    postId,
    likeCount: post?.like_count ?? 0,
    usageCount: post?.usage_count ?? 0,
    likedByUser,
    author: getPublicProfileName(post?.profiles),
    category: post?.category ?? "General",
  };
}

export function subscribeToAuthState(callback: (user: SessionUser | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ? { id: session.user.id, email: session.user.email } : null);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

/**
 * Supabase reports "signed out" by returning an AuthSessionMissingError from
 * getUser(), not by returning a null user. Rethrowing that turns an ordinary
 * state into a failure and aborts anonymous posting before it starts, so it is
 * translated back into `null` here. Genuine auth failures still throw.
 */
function isMissingSession(error: { name?: string; message?: string }) {
  return (
    error.name === "AuthSessionMissingError" ||
    /session missing|session_not_found/i.test(error.message ?? "")
  );
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (isMissingSession(error)) return null;
    throw error;
  }
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email };
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  if (!data) return null;
  return data as UserProfile;
}

export async function updateCurrentProfile(input: {
  display_name?: string | null;
}) {
  const user = await getSessionUser();
  if (!user) throw new Error("You must be signed in to update your profile.");

  const sanitizedDisplayName = input.display_name?.trim() || null;

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name: sanitizedDisplayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("id, display_name, avatar_url, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(error.message || "Supabase blocked the profile update.");
  }
  return data as UserProfile;
}

/**
 * A profile by id, with the counts shown on it.
 *
 * The private count is only requested when you are looking at your own
 * profile; for anyone else RLS returns nothing anyway, and asking would just
 * produce a misleading zero.
 */
export async function getAuthorProfile(authorId: string): Promise<AuthorProfile> {
  const viewer = await getSessionUser();
  const isSelf = viewer?.id === authorId;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, created_at")
    .eq("id", authorId)
    .maybeSingle();

  if (profileError && profileError.code !== "PGRST116") {
    throw new Error(`Could not load that profile: ${profileError.message}`);
  }

  const { count: publicCount, error: countError } = await supabase
    .from("forum_posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", authorId)
    .eq("status", "published")
    .eq("visibility", "public");

  if (countError) {
    throw new Error(`Could not count those prompts: ${countError.message}`);
  }

  let privateCount: number | undefined;
  if (isSelf) {
    const { count, error } = await supabase
      .from("forum_posts")
      .select("id", { count: "exact", head: true })
      .eq("author_id", authorId)
      .neq("visibility", "public");
    if (!error) privateCount = count ?? 0;
  }

  return {
    id: authorId,
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
    created_at: profile?.created_at ?? null,
    public_post_count: publicCount ?? 0,
    private_post_count: privateCount,
  };
}

/** One author's public prompts. */
export async function getAuthorPosts(authorId: string): Promise<ForumPost[]> {
  const { data, error } = await supabase
    .from("forum_posts")
    .select(
      "*, profiles:profiles!author_id(display_name), forum_post_like_totals:forum_post_like_totals(post_id, like_count)"
    )
    .eq("author_id", authorId)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load those prompts: ${error.message}`);
  return normalizeForumPosts(data ?? []);
}

/**
 * Everything you have written, private posts included.
 *
 * The filter here is convenience, not a security boundary — RLS on
 * forum_posts is what stops one account reading another's private prompts.
 */
export async function getMyPosts(): Promise<ForumPost[]> {
  const user = await getSessionUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("forum_posts")
    .select(
      "*, profiles:profiles!author_id(display_name), forum_post_like_totals:forum_post_like_totals(post_id, like_count)"
    )
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load your prompts: ${error.message}`);
  return normalizeForumPosts(data ?? []);
}

export async function createForumPost(input: ForumInsert) {
  const user = await getSessionUser();
  const isAnonymous = input.anonymous ?? !user;

  const payload = {
    author_id: user && !isAnonymous ? user.id : null,
    title: input.title.trim(),
    content: input.content.trim(),
    category: input.category ?? "General",
    tags: input.tags ?? [],
    // A private post needs an owner to scope it to, so anonymous forces public.
    visibility: isAnonymous ? "public" : input.visibility ?? "public",
    status: "published",
  };

  const { data, error } = await supabase
    .from("forum_posts")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data as ForumPost;
}

export async function setForumLikeState(postId: string, liked: boolean) {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("You must be signed in to like a post.");
  }

  const { data: existingLike, error: findError } = await supabase
    .from("forum_post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (findError) throw findError;

  const { data: current, error: fetchError } = await supabase
    .from("forum_post_like_totals")
    .select("like_count")
    .eq("post_id", postId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  const currentCount = current?.like_count ?? 0;

  if (liked) {
    if (existingLike) {
      return { liked: true, count: currentCount };
    }

    const { error: insertError } = await supabase
      .from("forum_post_likes")
      .insert({ post_id: postId, user_id: user.id });

    if (insertError) throw insertError;

    const nextCount = currentCount + 1;
    if (current) {
      const { error: updateError } = await supabase
        .from("forum_post_like_totals")
        .update({ like_count: nextCount })
        .eq("post_id", postId);
      if (updateError) throw updateError;
    } else {
      const { error: insertTotalError } = await supabase
        .from("forum_post_like_totals")
        .insert({ post_id: postId, like_count: 1 });
      if (insertTotalError) throw insertTotalError;
    }

    return { liked: true, count: nextCount };
  }

  if (!existingLike) {
    return { liked: false, count: currentCount };
  }

  const { error: deleteError } = await supabase
    .from("forum_post_likes")
    .delete()
    .eq("id", existingLike.id);

  if (deleteError) throw deleteError;

  const nextCount = Math.max(0, currentCount - 1);
  if (current) {
    const { error: updateError } = await supabase
      .from("forum_post_like_totals")
      .update({ like_count: nextCount })
      .eq("post_id", postId);
    if (updateError) throw updateError;
  }

  return { liked: false, count: nextCount };
}

export async function toggleLike(postId: string) {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("You must be signed in to like a post.");
  }

  const { data: existingLike, error: findError } = await supabase
    .from("forum_post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (findError) throw findError;

  return setForumLikeState(postId, !existingLike);
}

export async function signInWithEmailPassword(email: string, password: string) {
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();

  if (!trimmedEmail || !trimmedPassword) {
    throw new Error("Enter both your email address and password.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password: trimmedPassword,
  });

  if (error) {
    throw new Error(`Supabase sign-in failed: ${error.message}`);
  }

  return data;
}

export async function signUpWithEmailPassword(email: string, password: string) {
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();

  if (!trimmedEmail || !trimmedPassword) {
    throw new Error("Enter both your email address and password.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password: trimmedPassword,
  });

  if (error) {
    throw new Error(`Supabase sign-up failed: ${error.message}`);
  }

  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
