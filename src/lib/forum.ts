import { supabase } from "./supabase";
import type { ForumInsert, ForumPost } from "../types/forum";

export type SessionUser = {
  id: string;
  email?: string | null;
};

export async function getPublishedPosts(): Promise<ForumPost[]> {
  const { data, error } = await supabase
    .from("forum_posts")
    .select("*, profiles:profiles!author_id(display_name)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    const detail = error.message || "Unknown Supabase error";
    throw new Error(`Supabase forum query failed: ${detail}`);
  }

  return (data ?? []) as ForumPost[];
}

export function subscribeToAuthState(callback: (user: SessionUser | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ? { id: session.user.id, email: session.user.email } : null);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email };
}

export async function createForumPost(input: ForumInsert) {
  const user = await getSessionUser();
  const isAnonymous = input.anonymous ?? !user;

  const payload = {
    author_id: user && !isAnonymous ? user.id : null,
    author_name: user && !isAnonymous ? null : (input.author_name?.trim() || "Anonymous"),
    title: input.title.trim(),
    content: input.content.trim(),
    category: input.category ?? "General",
    tags: input.tags ?? [],
    visibility: input.visibility ?? "public",
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

  const { data: current, error: fetchError } = await supabase
    .from("forum_posts")
    .select("like_count, usage_count")
    .eq("id", postId)
    .single();

  if (fetchError) throw fetchError;

  const currentCount = current?.like_count ?? current?.usage_count ?? 0;

  if (existingLike) {
    const { error: deleteError } = await supabase
      .from("forum_post_likes")
      .delete()
      .eq("id", existingLike.id);

    if (deleteError) throw deleteError;

    const { data: updated, error: updateError } = await supabase
      .from("forum_posts")
      .update({ like_count: Math.max(0, currentCount - 1) })
      .eq("id", postId)
      .select("like_count")
      .single();

    if (updateError) throw updateError;

    return {
      liked: false,
      count: updated?.like_count ?? Math.max(0, currentCount - 1),
    };
  }

  const { error: insertError } = await supabase
    .from("forum_post_likes")
    .insert({ post_id: postId, user_id: user.id });

  if (insertError) throw insertError;

  const { data: updated, error: updateError } = await supabase
    .from("forum_posts")
    .update({ like_count: currentCount + 1 })
    .eq("id", postId)
    .select("like_count")
    .single();

  if (updateError) throw updateError;

  return {
    liked: true,
    count: updated?.like_count ?? currentCount + 1,
  };
}

export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    const detail = error.message || "Unknown auth error";
    throw new Error(`Supabase auth failed: ${detail}. Check Email auth is enabled and your Site URL is configured.`);
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
