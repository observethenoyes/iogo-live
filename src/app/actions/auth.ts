"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const EmailSchema = z.string().trim().min(3).max(320);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Optional allowlist. Supabase sign-up is open by default, so anyone who can
 * reach a deployed instance can create an account. Set `ALLOWED_EMAILS` to a
 * comma-separated list to restrict it; leave it unset to keep the previous
 * open-registration behaviour.
 */
function isAllowedEmail(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS;
  if (!raw) return true;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

export async function signIn(formData: FormData) {
  const parsed = EmailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };

  const email = parsed.data.toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  // Each attempt sends an email on our Supabase project's quota, so throttle
  // it. Per-IP is the only key available pre-login and is spoofable, but it
  // stops the obvious case of a script walking a list of addresses.
  const { ok, retryAfterSec } = rateLimit(`signin:${clientIp(await headers())}`, {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!ok) {
    const mins = Math.ceil(retryAfterSec / 60);
    return {
      error: `Too many sign-in attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  if (!isAllowedEmail(email)) {
    return { error: "That email address isn't allowed on this instance." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
