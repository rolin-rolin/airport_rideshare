import { type NextFetchEvent, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { updateSession } from "@/utils/supabase/middleware";
import {
  REFERRAL_COOKIE_MAX_AGE,
  REFERRAL_REF_COOKIE,
  REFERRAL_VISITOR_COOKIE,
  parseRef,
  parseVisitorId,
} from "@/lib/referral";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await updateSession(request);

  const ref = request.method === "GET" ? parseRef(request.nextUrl.searchParams.get("ref")) : null;
  if (ref) {
    const visitorId =
      parseVisitorId(request.cookies.get(REFERRAL_VISITOR_COOKIE)?.value) ?? crypto.randomUUID();
    const cookieOptions = {
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax" as const,
      secure: request.nextUrl.protocol === "https:",
      path: "/",
    };
    response.cookies.set(REFERRAL_VISITOR_COOKIE, visitorId, cookieOptions);
    response.cookies.set(REFERRAL_REF_COOKIE, ref, cookieOptions);

    // Recorded in the background so a tagged page load isn't slowed down;
    // a failed insert only loses one count.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    event.waitUntil(
      Promise.resolve(
        supabase.rpc("record_referral_visit", {
          p_ref: ref,
          p_visitor_id: visitorId,
          p_path: request.nextUrl.pathname,
        }),
      ).then(({ error }) => {
        if (error) console.error("record_referral_visit failed", error.message);
      }),
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
