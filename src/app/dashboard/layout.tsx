import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getMyActiveTripId } from "@/lib/trips";
import { GroupStatusBar } from "@/components/GroupStatusBar";
import { LeaveTripStatusProvider } from "@/components/LeaveTripStatus";
import { TripsRealtimeListener } from "@/components/TripsRealtimeListener";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
