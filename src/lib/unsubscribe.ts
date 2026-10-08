import { createClient } from "@/utils/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared by the confirm button on /unsubscribe and the one-click POST
// endpoint (/api/unsubscribe). Returns false for a malformed or unknown
// token; the token itself is the authorization (see migration 0022).
export async function unsubscribeToken(token: string | null | undefined): Promise<boolean> {
  if (!token || !UUID_RE.test(token)) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_email", { p_token: token });
  return !error && data === true;
}
