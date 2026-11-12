import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), getUser: vi.fn(), from: vi.fn(),
  select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn(), single: vi.fn(),
}));
vi.mock("./supabase", () => ({
  supabase: { auth: { signUp: mocks.signUp, getUser: mocks.getUser }, from: mocks.from },
}));
import { getPublicProfileName, signUpWithEmailPassword, updateUsername } from "./forum";

beforeEach(() => {
  vi.resetAllMocks();
  const chain = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle,
    upsert: mocks.upsert, single: mocks.single };
  mocks.from.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.eq.mockReturnValue(chain);
  mocks.upsert.mockReturnValue(chain);
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.signUp.mockResolvedValue({ data: { user: { id: "new" }, session: null }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mocks.single.mockResolvedValue({ data: { id: "owner", username: "jason_yan" }, error: null });
});

describe("username signup", () => {
  it("passes a normalized handle in namespaced metadata without requiring a session", async () => {
    const data = await signUpWithEmailPassword("jason@example.com", "password123", " Jason_Yan ");
    expect(mocks.eq).toHaveBeenCalledWith("username", "jason_yan");
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ data: { promptlab_username: "jason_yan" } }),
    }));
    expect(data.session).toBeNull();
  });

  it("requires a username and creates no auth user without one", async () => {
    await expect(signUpWithEmailPassword("jason@example.com", "password123", "   "))
      .rejects.toThrow("Choose a username");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("does not create an auth user when the handle is already taken", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "other" }, error: null });
    await expect(signUpWithEmailPassword("jason@example.com", "password123", "jason_yan"))
      .rejects.toThrow("already taken");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("does not create an auth user if availability cannot be checked", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(signUpWithEmailPassword("jason@example.com", "password123", "jason_yan"))
      .rejects.toThrow("Could not check");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});

describe("username settings", () => {
  it("saves against the authenticated id without overwriting the display name", async () => {
    await updateUsername("Jason_Yan");
    expect(mocks.upsert).toHaveBeenCalledWith({ id: "owner", username: "jason_yan" }, { onConflict: "id" });
  });

  it("explains database uniqueness conflicts", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "23505" } });
    await expect(updateUsername("jason_yan")).rejects.toThrow("already taken");
  });

  it("requires sign-in", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(updateUsername("jason_yan")).rejects.toThrow("Sign in");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

it("uses a public handle when there is no display name", () => {
  expect(getPublicProfileName({ username: "jason_yan", display_name: null })).toBe("@jason_yan");
  expect(getPublicProfileName({ username: "jason_yan", display_name: "Jason" })).toBe("Jason");
  expect(getPublicProfileName(null)).toBe("Anonymous");
});
