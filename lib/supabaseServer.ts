import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'

/**
 * Cookie-aware Supabase client for server components and route handlers.
 * Queries run as the logged-in user, so RLS policies scope all data access.
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Server components can't set cookies — middleware handles
          // session refresh, so swallowing this is safe.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

/** The logged-in user, or null. */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await getSupabaseServer()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

/** Comma-separated list in ADMIN_EMAILS bypasses the monthly quota. */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase())
}
