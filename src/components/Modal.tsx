"use client";

// A centered overlay panel, shared by the leave-trip confirmation flow
// (LeaveTripButton -> LeaveTripStatus). Deliberately has no click-outside-
// to-dismiss: both panels in that flow represent a step the user must
// explicitly act on (confirm, or acknowledge they've left), not a
// dismissible tooltip.
export function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg">
        {children}
      </div>
    </div>
  );
}
