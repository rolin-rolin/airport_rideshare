import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // The board works signed out, so that's where logging out lands.
  return NextResponse.redirect(new URL("/dashboard", request.url), 303);
}
