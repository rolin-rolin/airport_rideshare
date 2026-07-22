import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Temporary dev-only helper: exchanges an OTP (from supabase.auth.admin.generateLink)
// for a session directly, bypassing the browser magic-link redirect. Delete after use.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const email = searchParams.get("email");
  const otp = searchParams.get("otp");

  if (!email || !otp) {
    return NextResponse.json({ error: "missing email or otp" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "magiclink",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
