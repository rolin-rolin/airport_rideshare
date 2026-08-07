// One-off dev helper: mints a magic-link OTP via the Supabase admin API and
// prints the URL to hit the app's /auth/dev-otp route, bypassing email entirely.
// Usage: node dev-magic-link.mjs you@example.com
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
// Next.js precedence: .env.development.local overrides .env.local; load in that order
// since loadEnv only sets keys that aren't already set.
loadEnv(new URL("file://" + process.cwd() + "/.env.development.local"));
loadEnv(new URL("file://" + process.cwd() + "/.env.local"));

const email = process.argv[2];
if (!email) {
  console.error("usage: node dev-magic-link.mjs <email>");
  process.exit(1);
}

console.error("SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.error("SERVICE_ROLE_KEY set:", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
});

if (error) {
  console.error("generateLink failed:", error.status, error.message || error);
  process.exit(1);
}

const otp = data.properties.email_otp;
// A brand-new email comes back as verification_type "signup", not
// "magiclink" -- /auth/dev-otp needs the real type or verifyOtp rejects a
// perfectly fresh token as expired (see route.ts for why).
const type = data.properties.verification_type;
const appUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
console.log(`\nVisit this URL to log in as ${email}:\n`);
console.log(
  `${appUrl}/auth/dev-otp?email=${encodeURIComponent(email)}&otp=${otp}&type=${type}\n`,
);
