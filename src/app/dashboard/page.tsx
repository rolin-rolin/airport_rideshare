import Link from "next/link";
import { getBoardTrips, getMyActiveTrip } from "@/lib/trips";
import type { Direction } from "@/lib/types";
import { TabNav } from "@/components/TabNav";
import { TripsBoard } from "@/components/TripsBoard";
import { LogoutButton } from "@/components/LogoutButton";
import { SignInPromptButton } from "@/components/SignInPrompt";
import { createClient } from "@/utils/supabase/server";

const postButtonClass =
  "shrink-0 rounded-full bg-primary px-4 py-2 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dir?: string }>;
}) {
  const { dir } = await searchParams;
  const direction: Direction = dir === "to_airport" ? "to_airport" : "from_airport";

  // The other tab's trips are fetched only so its tab button can show a
  // live "N active postings" count. Going through the same getBoardTrips
  // the tab itself renders (the get_board_trips RPC, safe for anon) keeps
  // that count equal to what the tab would list, and the realtime
  // router.refresh() re-runs it like everything else -- signed in or out.
  const otherDirection: Direction = direction === "to_airport" ? "from_airport" : "to_airport";
  const supabase = await createClient();
  const [trips, otherTrips, myActiveTrip, { data: { user } }] = await Promise.all([
    getBoardTrips(direction),
    getBoardTrips(otherDirection),
    getMyActiveTrip(),
    supabase.auth.getUser(),
  ]);
  const tabCounts = { [direction]: trips.length, [otherDirection]: otherTrips.length };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-display-lg font-display font-bold text-foreground">
          Trip board
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {!user ? (
            // Signed out: both header actions open the sign-in prompt.
            <>
              <SignInPromptButton
                className={postButtonClass}
                title="Sign in to post a trip"
                message="Sign in with your nd.edu Google account to post a trip."
                next="/dashboard/new"
              >
                Post a trip
              </SignInPromptButton>
              <SignInPromptButton
                className="shrink-0 rounded-full border border-border px-4 py-2 text-label font-display font-semibold text-foreground transition-colors hover:bg-foreground/5"
                next={`/dashboard?dir=${direction}`}
              >
                Sign in
              </SignInPromptButton>
            </>
          ) : myActiveTrip ? (
            <span
              title="Leave your current trip before posting a new one"
              className="shrink-0 cursor-not-allowed rounded-full bg-primary/40 px-4 py-2 text-label font-display font-semibold text-background"
            >
              Post a trip
            </span>
          ) : (
            <Link
              href="/dashboard/new"
              className="shrink-0 rounded-full bg-primary px-4 py-2 text-label font-display font-semibold text-background transition-colors hover:bg-primary/90"
            >
              Post a trip
            </Link>
          )}
          {user && <LogoutButton />}
        </div>
      </div>

      {/* -mt-3 pulls this up under the heading (the column's gap-5 is meant
          for spacing between sections, not a heading and its subline). */}
      <p className="-mt-3 text-body font-body text-foreground/70">
        Post your own trip, or browse the To Airport and From Airport tabs below. Save time and
        money by joining a trip!
      </p>

      <TabNav counts={tabCounts} />

      <TripsBoard key={direction} trips={trips} direction={direction} myActiveTrip={myActiveTrip} />
    </div>
  );
}
