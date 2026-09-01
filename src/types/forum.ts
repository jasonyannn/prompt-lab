/** "private" is only meaningful for a signed-in author; see docs/security.md. */
export type PostVisibility = "public" | "unlisted" | "private";

/** A forum author, with the counts shown on their profile. */
export type AuthorProfile = {
  id: string;
  display_name: string | null;
  avatar_url?: string | null;
  created_at: string | null;
  public_post_count: number;
  /** Only populated when viewing your own profile. */
  private_post_count?: number;
};

export type ForumPost = {
  id: string;
  author_id: string | null;
  title: string;
  content: string;
  category: string;
  tags: string[];
  visibility: PostVisibility;
  status: "draft" | "published" | "flagged" | "removed";
  rating: number | null;
  usage_count: number;
  like_count?: number | null;
  created_at: string;
  updated_at: string;
  version: number;
  profiles?: {
    display_name?: string | null;
  } | null;
};

export type ForumInsert = {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  visibility?: PostVisibility;
  anonymous?: boolean;
};
