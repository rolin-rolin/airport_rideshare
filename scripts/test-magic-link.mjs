// One-off dev helper: sends a real magic-link email via signInWithOtp,
// exercising the actual SMTP (Resend) delivery path — unlike dev-magic-link.mjs,
// which bypasses email via the admin API.
// Usage: node scripts/test-magic-link.mjs you@example.com
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv(new URL("file://" + process.cwd() + "/.env.development.local"));
loadEnv(new URL("file://" + process.cwd() + "/.env.local"));

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/test-magic-link.mjs <email>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
  },
});

if (error) {
  console.log(`FAIL: status=${error.status} name=${error.name} message=${error.message}`);
  console.log(JSON.stringify(error, null, 2));
} else {
  console.log(`Sent to ${email} — check inbox / Resend logs`);
}
