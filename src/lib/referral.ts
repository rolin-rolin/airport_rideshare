// Referral tags on inbound links (e.g. the HPC flyer QR code opens
// /dashboard?ref=hpc). The proxy records each tagged page load and keeps
// the tag plus a random browser id in cookies; /auth/callback uses those
// cookies to attribute a new account to the tag. See migration 0025.

export const REFERRAL_REF_COOKIE = "dts_ref";
export const REFERRAL_VISITOR_COOKIE = "dts_vid";
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const REF_PATTERN = /^[a-z0-9_-]{1,32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalized ref tag, or null if missing/malformed. */
export function parseRef(value: string | null | undefined): string | null {
  const ref = value?.trim().toLowerCase();
  return ref && REF_PATTERN.test(ref) ? ref : null;
}

/** The visitor id if it is a well-formed UUID, else null. */
export function parseVisitorId(value: string | null | undefined): string | null {
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}
