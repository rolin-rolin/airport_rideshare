import { unsubscribeToken } from "@/lib/unsubscribe";

// One-click unsubscribe (RFC 8058): the URL in each announcement email's
// List-Unsubscribe header. Gmail and other providers POST here, with no
// cookies and no user in front of a browser, when a recipient presses the
// provider's own "Unsubscribe" button -- so this has to work unauthenticated
// and without a confirmation step. Always 200: the sender of the POST is a
// mail provider that can't act on an error, and distinguishing unknown
// tokens would only help someone probing for valid ones.
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  await unsubscribeToken(token);
  return new Response(null, { status: 200 });
}
