export type ForumPost = {
  id: string;
  author_id: string | null;
  author_name: string | null;
  title: string;
  content: string;
  category: string;
  tags: string[];
  visibility: "public" | "unlisted";
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
  visibility?: "public" | "unlisted";
  anonymous?: boolean;
  author_name?: string;
};
