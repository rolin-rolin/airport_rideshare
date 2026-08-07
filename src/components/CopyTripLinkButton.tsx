"use client";

import { useState } from "react";

// A private trip has no board presence, so this link is the only way anyone
// reaches it — the poster is meant to paste it into a group chat.
export function CopyTripLinkButton({ tripId }: { tripId: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    // Built at click time rather than on the server: the page is rendered
    // per-request and the origin is whatever host the poster is actually on.
    const url = `${window.location.origin}/dashboard/trips/${tripId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied over plain http and in some in-app
      // browsers; select the URL so it can still be copied by hand.
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-full border border-primary px-4 py-1.5 text-label font-display font-semibold text-primary transition-colors hover:bg-primary/10"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
