"use server";

import { redirect } from "next/navigation";
import { unsubscribeToken } from "@/lib/unsubscribe";

export async function confirmUnsubscribe(formData: FormData) {
  const ok = await unsubscribeToken(formData.get("token")?.toString());
  redirect(`/unsubscribe?status=${ok ? "done" : "invalid"}`);
}
