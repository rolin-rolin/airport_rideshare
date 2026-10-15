import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 text-center shadow-lg">
        <h1 className="mb-2 text-display-lg font-display font-bold text-foreground">
          Sign-in failed
        </h1>
        <p className="mb-6 text-body font-body text-foreground/70">
          Something went wrong completing your Google sign-in. Please try
          again with your @nd.edu account.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-full bg-primary px-5 py-2 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90"
        >
          Back to the trip board
        </Link>
      </div>
    </div>
  );
}
