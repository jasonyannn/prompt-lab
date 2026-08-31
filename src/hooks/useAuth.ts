import { useCallback, useEffect, useState } from "react";
import {
  getSessionUser,
  signInWithEmail,
  signOut as signOutRequest,
  subscribeToAuthState,
  type SessionUser,
} from "../lib/forum";

/**
 * One source of truth for who is signed in.
 *
 * Signing in happens on the landing page; signing out happens from the
 * workspace topbar. Both read this, so the two surfaces cannot disagree.
 */
export function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    void getSessionUser()
      .then((next) => {
        if (active) setUser(next);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    const unsubscribe = subscribeToAuthState((next) => setUser(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string) => {
    await signInWithEmail(email.trim());
  }, []);

  const signOut = useCallback(async () => {
    await signOutRequest();
    setUser(null);
  }, []);

  return { user, checking, signIn, signOut };
}
