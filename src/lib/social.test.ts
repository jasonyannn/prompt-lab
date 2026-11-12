import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), upsert: vi.fn(), insert: vi.fn() }));
vi.mock("./supabase", () => ({
  supabase: { auth: { getUser: mocks.getUser }, from: mocks.from },
}));
import { followUser, friendStatusFor, sendFriendRequest } from "./social";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue({ upsert: mocks.upsert, insert: mocks.insert });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "me" } }, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("friendStatusFor", () => {
  it("is none without a row or viewer", () => {
    expect(friendStatusFor(null, "me").friendStatus).toBe("none");
    expect(friendStatusFor({ id: "f", requester_id: "me", status: "pending" }, undefined).friendStatus).toBe("none");
  });
  it("tells outgoing from incoming by who asked", () => {
    expect(friendStatusFor({ id: "f", requester_id: "me", status: "pending" }, "me").friendStatus).toBe("outgoing");
    expect(friendStatusFor({ id: "f", requester_id: "them", status: "pending" }, "me").friendStatus).toBe("incoming");
  });
  it("reports accepted rows as friends", () => {
    expect(friendStatusFor({ id: "f", requester_id: "them", status: "accepted" }, "me")).toEqual({
      friendStatus: "friends",
      friendshipId: "f",
    });
  });
});

describe("social actions", () => {
  it("refuses to follow or befriend yourself before calling Supabase", async () => {
    await expect(followUser("me")).rejects.toThrow("yourself");
    await expect(sendFriendRequest("me")).rejects.toThrow("yourself");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("follows as the signed-in user", async () => {
    await followUser("them");
    expect(mocks.upsert).toHaveBeenCalledWith(
      { follower_id: "me", followee_id: "them" },
      expect.objectContaining({ ignoreDuplicates: true })
    );
  });
  it("explains a duplicate friend request", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    await expect(sendFriendRequest("them")).rejects.toThrow("already a friend request");
  });
  it("needs a session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(followUser("them")).rejects.toThrow("Sign in");
  });
});
