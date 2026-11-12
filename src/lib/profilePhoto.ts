import { supabase } from "./supabase";
import { getCurrentProfile, getSessionUser, type UserProfile } from "./forum";
import { prepareProfilePhoto, type CropView } from "./avatarImage";

const BUCKET = "forum-avatars";

async function removeOwnedPhoto(url: string | null | undefined, userId: string) {
  if (!url) return;
  const storage = supabase.storage.from(BUCKET);
  const prefix = storage.getPublicUrl(`${userId}/`).data.publicUrl;
  if (!url.startsWith(prefix)) return;
  const filename = url.slice(prefix.length);
  if (!/^[a-f0-9-]+\.jpg$/.test(filename)) return;
  // A failed cleanup must not turn a successfully saved profile into an error.
  const { error } = await storage.remove([`${userId}/${filename}`]);
  if (error) console.warn("Could not clean up the previous profile photo.");
}

async function savePhotoUrl(userId: string, avatarUrl: string | null): Promise<UserProfile> {
  const { data, error } = await supabase.from("forum_profiles")
    .upsert({ id: userId, avatar_url: avatarUrl }, { onConflict: "id" })
    .select("id, username, display_name, avatar_url, created_at, updated_at").single();
  if (error) throw new Error("Could not save your profile photo. Please try again.");
  return data as UserProfile;
}

export async function uploadProfilePhoto(file: File, crop?: CropView): Promise<UserProfile> {
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in to upload a profile photo.");
  const [photo, previous] = await Promise.all([prepareProfilePhoto(file, crop), getCurrentProfile()]);
  const storage = supabase.storage.from(BUCKET);
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await storage.upload(path, photo, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
  if (error) throw new Error("Could not upload your photo. Please try again.");
  const url = storage.getPublicUrl(path).data.publicUrl;
  let profile: UserProfile;
  try {
    profile = await savePhotoUrl(user.id, url);
  } catch (error) {
    await storage.remove([path]);
    throw error;
  }
  await removeOwnedPhoto(previous?.avatar_url, user.id);
  return profile;
}

export async function removeProfilePhoto(): Promise<UserProfile> {
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in to remove your profile photo.");
  const previous = await getCurrentProfile();
  const profile = await savePhotoUrl(user.id, null);
  await removeOwnedPhoto(previous?.avatar_url, user.id);
  return profile;
}
