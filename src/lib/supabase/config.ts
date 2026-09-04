/**
 * True if Supabase env vars are set, i.e. the app is in multi-user mode.
 *
 * Deliberately *not* `server-only` (unlike `lib/env.ts`, which reads secrets):
 * it touches only NEXT_PUBLIC_* values, so the proxy can import it and share
 * one definition with the DAL. Checking just the URL in one place and both
 * values in the other meant a half-configured deployment sent requests down
 * the auth path while `getSession()` treated them as self-hosted, building a
 * Supabase client with an undefined key.
 */
export function supabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
