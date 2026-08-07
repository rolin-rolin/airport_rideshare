<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase migrations

Whenever a new migration is added under `supabase/migrations/`, run `supabase db push` to apply it to the linked remote project in the same session — don't leave local and remote migration state to drift apart.
