<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase migrations

Whenever a new migration is added under `supabase/migrations/`, run `supabase db push` to apply it to the linked remote project in the same session — don't leave local and remote migration state to drift apart.

# Testing multi-user realtime flows

The app authenticates via `@supabase/ssr` cookies, which are shared by every tab in the same browser profile — logging in as a second user in another tab of the same window silently reauthenticates *all* tabs as that user. Two tabs in one window is not two users; it will look like realtime is leaking state across accounts when it's actually just one shared session.

To test as two real, simultaneously-logged-in users (e.g. verifying join/leave/realtime updates propagate correctly between them):

1. Mint a login link per account: `node scripts/dev-magic-link.mjs <email1>` and `node scripts/dev-magic-link.mjs <email2>` (requires local Supabase + `npm run dev` running — `scripts/dev-up.sh` starts both).
2. Open the first link in a normal browser window, the second in a private/incognito window. Normal and private windows keep fully separate cookie jars, so each session stays isolated.
3. Note: each minted OTP is single-use — re-visiting a link after it's been consumed (or letting it sit long enough to expire) fails with `otp_expired`; mint a fresh one instead of reusing.

This only isolates two sessions — normal + one private window. Additional simultaneous accounts need separate browser profiles, since multiple private windows in the same browser share one incognito cookie jar.

# Parallel agents doing browser-based testing

If multiple agents run concurrently and any of them drive a real browser (e.g. via claude-in-chrome) to test realtime/auth flows, giving each agent its own git worktree does NOT isolate their browser sessions — the claude-in-chrome tools share one actual Chrome profile/tab group across all agents by default. One agent minting a magic link and logging in as a different user will silently reauthenticate (or otherwise clobber tabs/state for) every other agent's open tabs, the same cookie-sharing problem described above, but between agents instead of between tabs.

Before launching parallel agents that will each open browser tabs, either: give each its own isolated browser profile/tab group if the tooling supports it, or serialize just the browser-touching steps (e.g. have agents queue for the shared browser, or fall back to driving the same client calls directly via a script instead of real clicks, as a workaround if isolation isn't available).
