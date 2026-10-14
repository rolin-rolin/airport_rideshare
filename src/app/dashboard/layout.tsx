import { createClient } from "@/utils/supabase/server";
import { getMyActiveTripId } from "@/lib/trips";
import { GroupStatusBar } from "@/components/GroupStatusBar";
import { LeaveTripStatusProvider } from "@/components/LeaveTripStatus";
import { TripsRealtimeListener } from "@/components/TripsRealtimeListener";
import { SignInPromptProvider } from "@/components/SignInPrompt";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out: the board is public (read through get_board_trips, migration
  // 0024), and anything that needs an account opens the sign-in prompt
  // instead -- the provider below is what makes TripCard/header buttons
  // prompt rather than navigate. The listener still subscribes to the
  // "board-public" ping topic, which 0024 opens to anon.
  if (!user) {
    return (
      <div className="flex flex-1 flex-col">
        <TripsRealtimeListener activeTripId={null} />
        <SignInPromptProvider>{children}</SignInPromptProvider>
      </div>
    );
  }

  const activeTripId = await getMyActiveTripId();

  return (
    <div className="flex flex-1 flex-col">
      <TripsRealtimeListener activeTripId={activeTripId} />
      <LeaveTripStatusProvider>
        <GroupStatusBar />
      </LeaveTripStatusProvider>
      {children}
    </div>
  );
}
