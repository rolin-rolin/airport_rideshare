-- Adds trips and signups to the supabase_realtime publication so an
-- already-open dashboard tab can hear about changes to either table and
-- refresh itself, regardless of what wrote them. This matters specifically
-- for the trip-cleanup cron job (0006/0007): it runs outside app code, so it
-- has no way to call Next's revalidatePath -- without a realtime
-- subscription, a tab left open across an expiry sweep would keep showing a
-- trip that the board no longer considers open/full.
--
-- RLS still gates realtime delivery: a client only receives change events
-- for rows its SELECT policies (0002, granted via 0009) would let it read,
-- so this doesn't widen access beyond what the board/roster queries already
-- expose.
alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.signups;
