import { useCallback, useEffect, useState } from "react";
import {
  getSessionUser,
  requestPasswordReset,
  subscribeToPasswordRecovery,
  updatePassword,
  signInWithEmailPassword,
  signOut as signOutRequest,
  signUpWithEmailPassword,
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
  const [recovering, setRecovering] = useState(false);

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
    const unsubscribeRecovery = subscribeToPasswordRecovery(() => setRecovering(true));
    return () => {
      active = false;
      unsubscribe();
      unsubscribeRecovery();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailPassword(email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    return await signUpWithEmailPassword(email.trim(), password, username);
  }, []);

  const signOut = useCallback(async () => {
    await signOutRequest();
    setUser(null);
  }, []);

  const sendResetEmail = useCallback(async (email: string) => {
    await requestPasswordReset(email);
  }, []);

  const setNewPassword = useCallback(async (password: string) => {
    await updatePassword(password);
    setRecovering(false);
  }, []);

  return { user, checking, recovering, signIn, signUp, signOut, sendResetEmail, setNewPassword };
}
