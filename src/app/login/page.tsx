import { redirect } from "next/navigation";

// The board is viewable signed out and signs people in from a prompt, so
// there's no separate login page anymore. Kept as a redirect so old links
// and bookmarks still land somewhere useful.
export default function LoginPage() {
  redirect("/dashboard");
}
