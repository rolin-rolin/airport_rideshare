import Link from "next/link";
import { getMyActiveTrip, getVehicleTypes } from "@/lib/trips";
import { TripForm } from "@/components/TripForm";
import { SignInCard } from "@/components/SignInPanel";
import { createClient } from "@/utils/supabase/server";

export default async function NewTripPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <SignInCard
        title="Sign in to post a trip"
        message="Sign in with your nd.edu Google account to post a trip."
        next="/dashboard/new"
      />
    );
  }

  const activeTrip = await getMyActiveTrip();

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <div>
        <Link
          href="/dashboard"
          className="text-body font-body text-foreground/50 hover:text-foreground"
        >
          &larr; Back to board
        </Link>
        <h1 className="mt-2 text-display-lg font-display font-bold text-foreground">
          Post a trip
        </h1>
      </div>

      {activeTrip ? (
        <p className="text-body font-body text-foreground/70">
          You&apos;re already in a trip. Leave your current trip before posting a new one.
        </p>
      ) : (
        <TripForm vehicleTypes={await getVehicleTypes()} />
      )}
    </div>
  );
}
