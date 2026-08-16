import Link from "next/link";
import { signInWithGoogle } from "./actions";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 shadow-lg">
        <h1 className="mb-1 text-display-lg font-display font-bold text-foreground">
          Down to Split?
        </h1>
        <p className="mb-6 text-body font-body text-foreground/70">
          Find other ND students to rideshare with back from/to the airport!
          And put a little extra money back in your pocket.
        </p>

        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>
        </form>

        <p className="mt-4 text-center text-label font-body text-foreground/50">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
