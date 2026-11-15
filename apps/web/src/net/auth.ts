import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Null when the build has no Supabase settings (e.g. tests). */
export const supabase: SupabaseClient | null =
  __SUPABASE_URL__ && __SUPABASE_KEY__
    ? createClient(__SUPABASE_URL__, __SUPABASE_KEY__, {
        auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true },
      })
    : null;

export const devAuthEnabled = __DEV_AUTH__;

const DEV_USER_KEY = "settlers.devUser";

/**
 * Dev sign-in name. Kept in sessionStorage so each browser tab can be a different player.
 */
export function getDevUser(): string | null {
  if (!devAuthEnabled) return null;
  try {
    return sessionStorage.getItem(DEV_USER_KEY);
  } catch {
    return null;
  }
}

export function setDevUser(name: string | null): void {
  try {
    if (name) sessionStorage.setItem(DEV_USER_KEY, name);
    else sessionStorage.removeItem(DEV_USER_KEY);
  } catch {
    // Storage blocked: dev sign-in just won't survive a reload.
  }
}

/** The token the server checks on connect: a dev token, or the current Supabase access token. */
export async function currentToken(): Promise<string | null> {
  const dev = getDevUser();
  if (dev) return `dev:${dev}`;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
