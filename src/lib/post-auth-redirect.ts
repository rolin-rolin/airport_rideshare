// Where to send a user after Google sign-in completes. The board's sign-in
// prompt remembers what the visitor was trying to do (e.g. join a specific
// trip) by stashing a path in a short-lived cookie before handing off to
// Google, and /auth/callback reads it back. A cookie rather than a query
// param on redirectTo: Supabase only redirects to allow-listed callback
// URLs, and a query string would make that match fragile.

export const POST_AUTH_NEXT_COOKIE = "dts_post_auth_next";
export const DEFAULT_POST_AUTH_PATH = "/dashboard";

// Only same-origin, in-app paths are honored -- anything else (absolute
// URLs, protocol-relative "//evil.com", backslash tricks) falls back to the
// board, so the cookie can never become an open redirect.
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_POST_AUTH_PATH;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_POST_AUTH_PATH;
  }
  if (!value.startsWith("/dashboard")) return DEFAULT_POST_AUTH_PATH;
  return value;
}
