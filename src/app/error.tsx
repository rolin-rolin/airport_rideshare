"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-display-lg font-semibold">
        Something went wrong
      </h1>
      <p className="max-w-sm text-body text-foreground/70">
        Give it another try — if it keeps happening, refresh the page.
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-full bg-primary px-5 py-2.5 text-body font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
