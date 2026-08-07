import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

// Temporary dev-only helper: exchanges an OTP (from supabase.auth.admin.generateLink)
// for a session directly, bypassing the browser magic-link redirect. Delete after use.
//
// `type` must match generateLink's own `verification_type`, not just always be
// "magiclink" -- GoTrue routes a brand-new email through its signup flow
// (verification_type "signup") and only returns "magiclink" once the user
// already exists and is confirmed. Passing the wrong type makes verifyOtp
// fail immediately with "otp_expired" even though the token is fresh, since
// it looks the token up under the wrong column. dev-magic-link.mjs forwards
// the real verification_type it got back from generateLink.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const email = searchParams.get("email");
  const otp = searchParams.get("otp");
  const type = (searchParams.get("type") ?? "magiclink") as EmailOtpType;

  if (!email || !otp) {
    return NextResponse.json({ error: "missing email or otp" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
