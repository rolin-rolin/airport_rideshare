import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-black/[.08] bg-white p-8 text-center dark:border-white/[.145] dark:bg-black">
        <h1 className="mb-2 text-xl font-semibold text-black dark:text-zinc-50">
          Sign-in link expired
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          That link is no longer valid. It may have expired or already been
          used. Request a new one below.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
