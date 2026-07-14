"use client";

import { useActionState } from "react";
import { sendMagicLink } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(sendMagicLink, {
    error: null,
    sent: false,
  });

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-black">
        <h1 className="mb-1 text-xl font-semibold text-black dark:text-zinc-50">
          Sign in
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Use your school email — we&apos;ll send you a magic link.
        </p>

        {state.sent ? (
          <p className="text-sm text-zinc-800 dark:text-zinc-200">
            Check your email for a sign-in link.
          </p>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            <input
              type="email"
              name="email"
              required
              placeholder="you@nd.edu"
              className="rounded-md border border-black/[.08] bg-white px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
            {state.error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {pending ? "Sending..." : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
