// How tagged links are doing (migration 0025). For each ref tag, e.g. "hpc"
// from the Hall Presidents' Council flyer QR code (/dashboard?ref=hpc):
//   page loads       every tagged page load, reloads included
//   unique visitors  distinct browsers (random id in a cookie)
//   new accounts     accounts created after that browser's first tagged visit
//   ...then posted   of those accounts, how many created a trip
//   ...then joined   of those accounts, how many joined someone else's trip
//
// Usage:
//   node scripts/referral-report.mjs              all tags
//   node scripts/referral-report.mjs hpc          one tag, with a per-day breakdown
//   node scripts/referral-report.mjs --local ...  local Supabase instead of production
//
// Needs in the env file: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
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

const args = process.argv.slice(2);
const local = args.includes("--local");
loadEnv(process.cwd() + (local ? "/.env.development.local" : "/.env.local"));
const only = args.find((a) => !a.startsWith("--"))?.toLowerCase();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Paged: a single select stops at the API's 1000-row cap.
async function all(table, columns, filter = (q) => q) {
  const rows = [];
  for (;;) {
    const { data, error } = await filter(supabase.from(table).select(columns)).range(rows.length, rows.length + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const byRef = (q) => (only ? q.eq("ref", only) : q);
const visits = await all("referral_visits", "ref, visitor_id, visited_at", byRef);
const signups = await all("referral_signups", "ref, user_id, created_at", byRef);

const userIds = signups.map((s) => s.user_id);
const posted = new Set();
const joined = new Set();
if (userIds.length) {
  const own = await all("trips", "id, created_by", (q) => q.in("created_by", userIds));
  for (const t of own) posted.add(t.created_by);
  const ownTrip = new Set(own.map((t) => `${t.id}:${t.created_by}`));
  for (const s of await all("signups", "trip_id, user_id", (q) => q.in("user_id", userIds)))
    if (!ownTrip.has(`${s.trip_id}:${s.user_id}`)) joined.add(s.user_id);
}

const refs = [...new Set([...visits.map((v) => v.ref), ...signups.map((s) => s.ref)])].sort();
if (!refs.length) {
  console.log(only ? `No visits tagged ref=${only} yet.` : "No tagged visits yet.");
  process.exit(0);
}

const rows = refs.map((ref) => {
  const v = visits.filter((x) => x.ref === ref);
  const s = signups.filter((x) => x.ref === ref);
  return {
    ref,
    "page loads": v.length,
    "unique visitors": new Set(v.map((x) => x.visitor_id)).size,
    "new accounts": s.length,
    "...then posted": s.filter((x) => posted.has(x.user_id)).length,
    "...then joined": s.filter((x) => joined.has(x.user_id)).length,
    "first visit": v.length ? v.map((x) => x.visited_at).sort()[0].slice(0, 16).replace("T", " ") + " UTC" : "",
  };
});
console.table(rows);

if (only) {
  const day = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Indiana/Indianapolis" });
  const days = new Map();
  for (const v of visits) {
    const d = days.get(day(v.visited_at)) ?? { visitors: new Set(), "new accounts": 0 };
    d.visitors.add(v.visitor_id);
    days.set(day(v.visited_at), d);
  }
  for (const s of signups) {
    const d = days.get(day(s.created_at)) ?? { visitors: new Set(), "new accounts": 0 };
    d["new accounts"]++;
    days.set(day(s.created_at), d);
  }
  console.log(`\nBy day (South Bend time), ref=${only}:`);
  console.table(
    [...days.entries()].sort().map(([date, d]) => ({ date, "unique visitors": d.visitors.size, "new accounts": d["new accounts"] })),
  );
}
