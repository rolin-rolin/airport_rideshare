// Returns a Supabase client authenticated as a real user, via the same
// no-SMTP magic-link workaround dev-magic-link.mjs / /auth/dev-otp use for
// local login. For ad hoc verification scripts (like the realtime broadcast
// check that led to this file), this is what to reach for instead of the
// service-role key -- service-role bypasses RLS entirely, so a script using
// it can look like it's testing a policy while actually testing nothing
// (see migration 0015: a real bug in a realtime.messages policy that
// service-role-based testing missed completely).
//
// Usage as a library:
//   import { getAuthenticatedClient } from "./test-as-user.mjs";
//   const { client, user } = await getAuthenticatedClient("you@nd.edu");
//   await client.from("trips").select("*");   // subject to RLS as this user
//   client.channel("board-public", { config: { private: true } })...  // real JWT,
//   // since supabase-js syncs realtime auth automatically on auth state change --
//   // every subscribe on `client` after this carries the user's actual JWT.
//
// Usage standalone (smoke test -- confirms login works, prints the user,
// runs one RLS-scoped query):
//   node scripts/test-as-user.mjs you@nd.edu
//
// Note: the domain gate (migration 0001) only accepts @nd.edu addresses --
// a non-matching email fails at signup, not at this script's OTP exchange.
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Mints a real session for `email` (via the admin API, bypassing email
// delivery) and exchanges it on an anon-key client. The service-role client
// used to mint the link is thrown away afterward -- it never touches app
// data, only issues the OTP.
export async function getAuthenticatedClient(email) {
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  const admin = createClient(url, serviceRoleKey);
  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) {
    throw new Error(`generateLink failed: ${linkError.status} ${linkError.message}`);
  }

  const otp = data.properties.email_otp;
  // A brand-new email comes back as verification_type "signup", not
  // "magiclink" -- verifyOtp rejects a fresh token as "expired" if given the
  // wrong type (same gotcha src/app/auth/dev-otp/route.ts works around).
  const type = data.properties.verification_type;

  const client = createClient(url, anonKey);
  const { data: sessionData, error: verifyError } = await client.auth.verifyOtp({
    email,
    token: otp,
    type,
  });
  if (verifyError) {
    throw new Error(`verifyOtp failed: ${verifyError.message}`);
  }

  return { client, user: sessionData.user };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: node scripts/test-as-user.mjs <email>");
    process.exit(1);
  }

  const { client, user } = await getAuthenticatedClient(email);
  console.log("Authenticated as:", user.id, user.email);

  const { data, error } = await client.from("trips").select("id").limit(1);
  console.log("Sample RLS-scoped query (trips, limit 1):", error ? error.message : data);

  await client.auth.signOut();
}
