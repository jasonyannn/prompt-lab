import { getSessionUser } from "./forum";
import { supabase } from "./supabase";

/**
 * Follows and friend requests between forum profiles.
 *
 * Every rule here is enforced by RLS in
 * supabase/migrations/20261112020000_forum_social.sql; the checks below only
 * give readable errors and avoid pointless round trips.
 */

/** How the signed-in viewer relates to another profile as a friend. */
export type FriendStatus =
  | "none"
  | "outgoing" // viewer sent a request, waiting on them
  | "incoming" // they sent one, waiting on the viewer
  | "friends";

export type SocialState = {
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  friendStatus: FriendStatus;
  /** Row id of the friendship, needed to accept / cancel / unfriend. */
  friendshipId: string | null;
};

export type FriendRequest = {
  id: string;
  requester_id: string;
  created_at: string;
  profile: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
};

async function requireUser(action: string) {
  const user = await getSessionUser();
  if (!user) throw new Error(`Sign in to ${action}.`);
  return user;
}

export function friendStatusFor(
  row: { id: string; requester_id: string; status: string } | null | undefined,
  viewerId: string | undefined
): { friendStatus: FriendStatus; friendshipId: string | null } {
  if (!row || !viewerId) return { friendStatus: "none", friendshipId: null };
  if (row.status === "accepted") return { friendStatus: "friends", friendshipId: row.id };
  return {
    friendStatus: row.requester_id === viewerId ? "outgoing" : "incoming",
    friendshipId: row.id,
  };
}

async function count(column: "follower_id" | "followee_id", userId: string) {
  const { count: total, error } = await supabase
    .from("forum_follows")
    .select(column, { count: "exact", head: true })
    .eq(column, userId);
  if (error) throw new Error(`Could not load follow counts: ${error.message}`);
  return total ?? 0;
}

export async function getSocialState(profileId: string): Promise<SocialState> {
  const viewer = await getSessionUser();
  const [followerCount, followingCount] = await Promise.all([
    count("followee_id", profileId),
    count("follower_id", profileId),
  ]);

  let isFollowing = false;
  let friend: { friendStatus: FriendStatus; friendshipId: string | null } = {
    friendStatus: "none",
    friendshipId: null,
  };

  if (viewer && viewer.id !== profileId) {
    const [follow, friendship] = await Promise.all([
      supabase
        .from("forum_follows")
        .select("followee_id")
        .eq("follower_id", viewer.id)
        .eq("followee_id", profileId)
        .maybeSingle(),
      // RLS already limits this to the viewer's own rows; the filter picks the pair.
      supabase
        .from("forum_friendships")
        .select("id, requester_id, status")
        .or(
          `and(requester_id.eq.${viewer.id},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${viewer.id})`
        )
        .maybeSingle(),
    ]);
    if (follow.error) throw new Error(`Could not load follow state: ${follow.error.message}`);
    if (friendship.error) throw new Error(`Could not load friend state: ${friendship.error.message}`);
    isFollowing = Boolean(follow.data);
    friend = friendStatusFor(friendship.data, viewer.id);
  }

  return { followerCount, followingCount, isFollowing, ...friend };
}

export async function followUser(profileId: string) {
  const user = await requireUser("follow people");
  if (user.id === profileId) throw new Error("You cannot follow yourself.");
  const { error } = await supabase
    .from("forum_follows")
    .upsert({ follower_id: user.id, followee_id: profileId }, { onConflict: "follower_id,followee_id", ignoreDuplicates: true });
  if (error) throw new Error(`Could not follow: ${error.message}`);
}

export async function unfollowUser(profileId: string) {
  const user = await requireUser("unfollow people");
  const { error } = await supabase
    .from("forum_follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", profileId);
  if (error) throw new Error(`Could not unfollow: ${error.message}`);
}

export async function sendFriendRequest(profileId: string) {
  const user = await requireUser("add friends");
  if (user.id === profileId) throw new Error("You cannot add yourself as a friend.");
  const { error } = await supabase
    .from("forum_friendships")
    .insert({ requester_id: user.id, addressee_id: profileId });
  if (error) {
    // 23505 = the pair already has a row (request pending either way, or friends).
    if (error.code === "23505") throw new Error("There is already a friend request between you two.");
    throw new Error(`Could not send the request: ${error.message}`);
  }
}

export async function acceptFriendRequest(friendshipId: string) {
  await requireUser("accept requests");
  const { data, error } = await supabase
    .from("forum_friendships")
    .update({ status: "accepted" })
    .eq("id", friendshipId)
    .select("id");
  if (error) throw new Error(`Could not accept the request: ${error.message}`);
  // RLS filters rows that are not yours to accept without raising an error.
  if (!data || data.length === 0) throw new Error("That request is no longer available.");
}

/** Cancel a sent request, decline a received one, or unfriend. */
export async function removeFriendship(friendshipId: string) {
  await requireUser("manage friends");
  const { error } = await supabase.from("forum_friendships").delete().eq("id", friendshipId);
  if (error) throw new Error(`Could not update friends: ${error.message}`);
}

export async function getIncomingRequests(): Promise<FriendRequest[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("forum_friendships")
    .select("id, requester_id, created_at, profile:forum_profiles!requester_id(display_name, username, avatar_url)")
    .eq("addressee_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load friend requests: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    ...row,
    profile: Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile ?? null,
  })) as FriendRequest[];
}
