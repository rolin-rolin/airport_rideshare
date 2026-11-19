import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { POST_AUTH_NEXT_COOKIE, safeNextPath } from "@/lib/post-auth-redirect";
import {
  REFERRAL_REF_COOKIE,
  REFERRAL_VISITOR_COOKIE,
  parseRef,
  parseVisitorId,
} from "@/lib/referral";

const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN!;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Set by signInWithGoogle (login/actions.ts) right before the OAuth
  // hand-off; consumed here either way so it can't linger into a later
  // sign-in.
  const cookieStore = await cookies();
  const next = safeNextPath(cookieStore.get(POST_AUTH_NEXT_COOKIE)?.value);
  cookieStore.delete(POST_AUTH_NEXT_COOKIE);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // hd is a client-side hint only (a crafted authorize URL can omit
      // it), so re-verify the domain and Google's email verification claim
      // server-side before treating this as an authenticated nd.edu user.
      const domain = user?.email?.split("@")[1]?.toLowerCase();
      const emailVerified = user?.user_metadata?.email_verified === true;

      if (domain === ALLOWED_EMAIL_DOMAIN && emailVerified) {
        // Credit a new account to the tagged link (e.g. the HPC flyer) this
        // browser arrived through. The database only counts it if the
        // account is newer than that visit; never blocks the sign-in.
        const ref = parseRef(cookieStore.get(REFERRAL_REF_COOKIE)?.value);
        const visitorId = parseVisitorId(cookieStore.get(REFERRAL_VISITOR_COOKIE)?.value);
        if (ref && visitorId) {
          const { error: refError } = await supabase.rpc("claim_referral_signup", {
            p_ref: ref,
            p_visitor_id: visitorId,
          });
          if (refError) console.error("claim_referral_signup failed", refError.message);
        }
        return NextResponse.redirect(`${origin}${next}`);
      }

      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/auth/not-authorized`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
