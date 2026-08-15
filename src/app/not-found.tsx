import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-display-lg font-semibold">
        Trip not found
      </h1>
      <p className="max-w-sm text-body text-foreground/70">
        This trip doesn&apos;t exist, or the link is no longer valid.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-full bg-primary px-5 py-2.5 text-body font-medium text-white"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
