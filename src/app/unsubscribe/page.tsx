import type { Metadata } from "next";
import { confirmUnsubscribe } from "./actions";

export const metadata: Metadata = {
  title: "Unsubscribe · Down to Split",
  robots: { index: false },
};

// Landing page for the footer link in announcement emails. Unsubscribing
// takes a button press rather than happening on page load: mail providers
// and link scanners fetch every URL in a message, and a GET that opted
// people out would unsubscribe recipients who never clicked anything.
// (Mail clients' own one-click button POSTs to /api/unsubscribe instead.)
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token, status } = await searchParams;

  let heading: string;
  let body: string;
  if (status === "done") {
    heading = "You're unsubscribed";
    body = "You won't get any more emails from Down to Split.";
  } else if (status === "invalid" || !token) {
    heading = "This link didn't work";
    body =
      "We couldn't find that unsubscribe link. Email ride@downtosplit.app and we'll take you off the list.";
  } else {
    heading = "Unsubscribe?";
    body = "Stop getting emails from Down to Split at this address.";
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 text-center shadow-lg">
        <h1 className="mb-2 text-display-lg font-display font-bold text-foreground">
          {heading}
        </h1>
        <p className="text-body font-body text-foreground/70">{body}</p>

        {token && !status && (
          <form action={confirmUnsubscribe} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="rounded-full bg-primary px-5 py-2 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90"
            >
              Unsubscribe
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
