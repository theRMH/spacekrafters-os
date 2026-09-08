// Supabase Auth needs an email identifier even though the app only ever collects
// a phone number — this derives a stable, non-deliverable email from the phone
// number so the login UI never has to know Supabase Auth is involved at all.
// Kept in sync by hand with the identical one-liner in supabase/functions/admin-user-sync
// (plain Deno scripts can't import this file).
export function syntheticEmailFromMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '').slice(-10)
  return `u${digits}@sks.internal`
}
