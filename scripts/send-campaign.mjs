// Sends the launch announcement (emails/announcement.{html,txt}) through
// Resend in resumable daily batches. Recipient state lives in
// public.email_campaign_recipients (migration 0022), not in a local file,
// so a batch can be interrupted and rerun without emailing anyone twice and
// unsubscribes made on the site are honored by the very next send.
//
// Usage:
//   node scripts/send-campaign.mjs import <list.csv>   load addresses (CSV order = send order)
//                                                      and first names, if the file has a
//                                                      header row naming a name column
//   node scripts/send-campaign.mjs status              counts: pending / sent / unsubscribed
//   node scripts/send-campaign.mjs send --limit 100    send the next 100 pending addresses
//
// send options:
//   --dry-run        print who would be emailed, send nothing
//   --interval <s>   seconds between emails (default 20) -- a trickle, not a burst
//   --to <email>     send one copy to this address only, as a preview; it must
//                    already be imported, and is not marked as sent
//
// Targets whatever .env.local points at (the production project). Pass
// --local as the first flag to use .env.development.local (local Supabase)
// and http://localhost:3000 unsubscribe links instead.
//
// Needs in the env file: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// RESEND_API_KEY, CAMPAIGN_POSTAL_ADDRESS.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const FROM = "Down to Split <ride@downtosplit.app>";
const REPLY_TO = "ride@downtosplit.app";
const SUBJECT = "Split your ride to the airport with other ND students";
// Stop the batch after this many failed sends in a row -- a run of failures
// means something is wrong (key, quota, suspension), not one bad address.
const MAX_CONSECUTIVE_FAILURES = 3;

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
// Deliberately one or the other, never both: unlike the dev scripts, this
// must not silently fall through to a different project's keys.
loadEnv(new URL("file://" + process.cwd() + (local ? "/.env.development.local" : "/.env.local")));
if (local) loadEnv(new URL("file://" + process.cwd() + "/.env.local")); // RESEND_API_KEY, CAMPAIGN_POSTAL_ADDRESS only live here

const SITE_URL = local ? "http://localhost:3000" : "https://downtosplit.app";

function flag(name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing in env file: ${missing.join(", ")}`);
    process.exit(1);
  }
}

requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const TABLE = "email_campaign_recipients";

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(template, values, escape) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown placeholder {{${key}}} in template`);
    return escape ? escapeHtml(values[key]) : values[key];
  });
}

async function count(filter) {
  const { count: n, error } = await filter(
    supabase.from(TABLE).select("*", { count: "exact", head: true }),
  );
  // A failed head request comes back with count null and no usable error
  // body, so treat null as failure rather than printing "total null".
  if (error || n === null) throw error ?? new Error(`Could not count ${TABLE}`);
  return n;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// Greeting for rows with no usable name: "Hi there,".
const FALLBACK_FIRST_NAME = "there";

// Minimal CSV line parser: commas, double-quoted cells, "" as an escaped
// quote. Enough for a contact export; cells never span lines here.
function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

// Prefers a dedicated first-name column; otherwise a full-name column that
// firstNameFrom has to pick the first name out of.
function findNameColumn(header) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const first = norm.findIndex((h) => ["firstname", "first", "givenname", "preferredname"].includes(h));
  if (first !== -1) return { index: first, kind: "first" };
  const full = norm.findIndex((h) => ["name", "fullname", "studentname", "displayname"].includes(h));
  return full === -1 ? null : { index: full, kind: "full" };
}

// Returns null rather than guessing when the cell doesn't hold something
// that reads as a name -- a wrong "Hi Smith," is worse than "Hi there,".
function firstNameFrom(cell, kind) {
  let name = cell.trim();
  // "Last, First Middle" -> the part after the comma.
  if (kind === "full" && name.includes(",")) name = name.split(",")[1].trim();
  name = name.split(/\s+/)[0] ?? "";
  if (!/^\p{L}[\p{L}'’-]*$/u.test(name) || name.length < 2) return null;
  // Exports are often ALL CAPS or all lowercase; leave mixed case (McKenna) alone.
  if (name === name.toUpperCase() || name === name.toLowerCase()) {
    name = name[0].toUpperCase() + name.slice(1).toLowerCase();
  }
  return name;
}

async function importList(path) {
  if (!path) {
    console.error("usage: node scripts/send-campaign.mjs import <list.csv>");
    process.exit(1);
  }
  const rows = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseCsvLine);

  // A first row with no address in it is a header; use it to find the name
  // column. Without one, addresses are still imported and everyone gets the
  // generic greeting.
  const hasHeader = rows.length > 0 && !rows[0].some((cell) => EMAIL_RE.test(cell));
  const nameColumn = hasHeader ? findNameColumn(rows[0]) : null;

  // The address is the first email-looking cell on each line, so it can be
  // in any column.
  const seen = new Set();
  const recipients = [];
  let skipped = 0;
  for (const cells of hasHeader ? rows.slice(1) : rows) {
    const email = cells.map((c) => c.match(EMAIL_RE)?.[0]).find(Boolean)?.toLowerCase();
    if (!email || seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);
    recipients.push({
      email,
      first_name: nameColumn ? firstNameFrom(cells[nameColumn.index] ?? "", nameColumn.kind) : null,
    });
  }
  const named = recipients.filter((r) => r.first_name).length;

  // Continue numbering after any earlier import so a second file queues
  // behind the first instead of interleaving with it.
  const { data: last, error: lastError } = await supabase
    .from(TABLE)
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  const start = (last[0]?.position ?? 0) + 1;

  let added = 0;
  for (let i = 0; i < recipients.length; i += 500) {
    const rows = recipients.slice(i, i + 500).map((r, j) => ({ ...r, position: start + i + j }));
    // ignoreDuplicates: an address already in the table keeps its token,
    // sent_at and unsubscribed_at -- re-importing never resets anyone. (It
    // also keeps its existing first_name; fix a name by editing the row.)
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: "email", ignoreDuplicates: true })
      .select("email");
    if (error) throw error;
    added += data.length;
  }
  console.log(
    `${recipients.length} addresses in file (${skipped} lines skipped: no address, or a repeat); ` +
      `${added} newly added, ${recipients.length - added} already in the list.`,
  );
  console.log(
    nameColumn
      ? `First names from column "${rows[0][nameColumn.index].trim()}": ${named} of ${recipients.length} ` +
          `(the rest get "Hi ${FALLBACK_FIRST_NAME},").`
      : `No name column found -- everyone gets "Hi ${FALLBACK_FIRST_NAME},". ` +
          "Add a header row with a column like first_name or name to personalize.",
  );
}

async function status() {
  const total = await count((q) => q);
  const sent = await count((q) => q.not("sent_at", "is", null));
  const unsubscribed = await count((q) => q.not("unsubscribed_at", "is", null));
  const pending = await count((q) => q.is("sent_at", null).is("unsubscribed_at", null));
  console.log(`total ${total} | sent ${sent} | unsubscribed ${unsubscribed} | pending ${pending}`);
}

async function sendOne(row, templates, values) {
  const pageUrl = `${SITE_URL}/unsubscribe?token=${row.token}`;
  const oneClickUrl = `${SITE_URL}/api/unsubscribe?token=${row.token}`;
  const v = {
    ...values,
    FIRST_NAME: row.first_name || FALLBACK_FIRST_NAME,
    UNSUBSCRIBE_URL: pageUrl,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [row.email],
      reply_to: REPLY_TO,
      subject: SUBJECT,
      html: render(templates.html, v, true),
      text: render(templates.text, v, false),
      headers: {
        "List-Unsubscribe": `<${oneClickUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? JSON.stringify(body)}`);
  return body.id;
}

async function send() {
  const dryRun = args.includes("--dry-run");
  const previewTo = flag("--to")?.toLowerCase();
  const limit = Number(flag("--limit"));
  const interval = Number(flag("--interval") ?? 20);
  if (!previewTo && (!Number.isInteger(limit) || limit <= 0)) {
    console.error("send needs --limit <n> (or --to <email> for a single preview)");
    process.exit(1);
  }

  requireEnv("RESEND_API_KEY", "CAMPAIGN_POSTAL_ADDRESS");
  const values = { POSTAL_ADDRESS: process.env.CAMPAIGN_POSTAL_ADDRESS };
  const templates = {
    html: readFileSync("emails/announcement.html", "utf8"),
    text: readFileSync("emails/announcement.txt", "utf8"),
  };

  let query = supabase.from(TABLE).select("email, first_name, token, unsubscribed_at");
  query = previewTo
    ? query.eq("email", previewTo)
    : query.is("sent_at", null).is("unsubscribed_at", null).order("position").limit(limit);
  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows.length) {
    console.log(previewTo ? `${previewTo} is not in the list (import it first).` : "Nothing pending.");
    return;
  }

  console.log(
    `${dryRun ? "[dry run] " : ""}${rows.length} email(s) via ${SITE_URL}, ${interval}s apart ` +
      `(~${Math.ceil((rows.length * interval) / 60)} min). Ctrl-C stops cleanly between sends.`,
  );

  let sent = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  for (const [i, row] of rows.entries()) {
    if (dryRun) {
      console.log(`would send: ${row.email} (Hi ${row.first_name || FALLBACK_FIRST_NAME},)`);
      continue;
    }
    if (!previewTo) {
      // Re-read right before sending: the list was fetched at the start of
      // a batch that can run for hours, and someone may have unsubscribed
      // (or another run may have sent to them) in the meantime.
      const { data: fresh, error: freshError } = await supabase
        .from(TABLE)
        .select("sent_at, unsubscribed_at")
        .eq("email", row.email)
        .single();
      if (freshError) throw freshError;
      if (fresh.sent_at || fresh.unsubscribed_at) {
        console.log(`skip (${fresh.sent_at ? "already sent" : "unsubscribed"}): ${row.email}`);
        continue;
      }
    }

    try {
      const id = await sendOne(row, templates, values);
      if (!previewTo) {
        const { error: markError } = await supabase
          .from(TABLE)
          .update({ sent_at: new Date().toISOString(), resend_id: id })
          .eq("email", row.email);
        // The email went out but isn't recorded, so a rerun would send it
        // again -- stop here rather than risk repeating that for the batch.
        if (markError) {
          console.error(`SENT to ${row.email} (${id}) but could not record it: ${markError.message}`);
          console.error("Stopping. Mark this address as sent by hand before rerunning.");
          process.exit(1);
        }
      }
      sent++;
      consecutiveFailures = 0;
      console.log(`[${i + 1}/${rows.length}] sent ${row.email} ${id}`);
    } catch (err) {
      failed++;
      consecutiveFailures++;
      console.error(`[${i + 1}/${rows.length}] FAILED ${row.email}: ${err.message}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`${MAX_CONSECUTIVE_FAILURES} failures in a row -- stopping.`);
        break;
      }
    }
    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, interval * 1000));
  }
  if (!dryRun) console.log(`Done: ${sent} sent, ${failed} failed.`);
}

const command = args.find((a) => ["import", "status", "send"].includes(a));
if (command === "import") await importList(args[args.indexOf("import") + 1]);
else if (command === "status") await status();
else if (command === "send") await send();
else {
  console.error("usage: node scripts/send-campaign.mjs [--local] <import <csv> | status | send --limit <n>>");
  process.exit(1);
}
