# Campus Airport Rideshare Pooling
## MVP Design Doc

## 1. Problem

Students flying home from campus cluster heavily around the same breaks (Thanksgiving, winter break, spring break) and travel between the same two points: campus and the airport. Because everyone is going the same place at roughly the same time, splitting an Uber/Lyft is usually possible and would meaningfully cut cost per person — but there's no reliable way to find other students on the same timeline. Today, students either wander the airport hoping to spot someone, or post in group chats and hope for a match. This app removes the search problem by giving students a single place to post their trip and see who else is going at the same time.

## 2. Scope

In scope for MVP: single campus, web app, school-email-gated signup, post/browse/join trips, live spot and bag counts, GroupMe link for coordination.

Explicitly out of scope for MVP (deferred, not rejected): multi-school support, in-app messaging/chat, in-app payments or fare splitting, Uber/Lyft booking integration, ratings/reputation system, push notifications, automated no-show detection.

## 3. Core Concept

Trips are posted as open, rolling signups. A trip is a shared, symmetric entry that anyone can join at any time up until the vehicle's capacity is reached.

The in-app signup list is the single source of truth for who's in a group and what the live spot/bag counts are. Coordination happens outside the app (GroupMe, or just phone number); joining only happens inside the app.

There is no formal "trip organizer" role. Whoever ends up ordering the Uber does so informally, coordinated via the group's GroupMe chat. This avoids a single point of failure (see Section 6).

A user can only belong to one active group at a time (see Section 4.3).

## 4. User Flow

### 4.1 Authentication

Sign up / log in with school email address.
Domain-gated to the pilot campus's email domain (e.g. @nd.edu) at MVP. No further identity verification needed for now.

### 4.2 Posting and browsing trips

Two tabs: To Airport and From Airport.

To post a trip, the poster selects a **vehicle type** (UberX, UberXL, etc.) from a fixed reference list. The vehicle type determines the trip's seat capacity and large-bag capacity — these aren't just a recommendation, they're the cap enforced on that post (see 4.3).

Each trip post includes:

- Flight date/time
- Pickup location and dropoff location
- Vehicle type (sets seat capacity and bag capacity)
- Live count: spots filled / spots left
- Live count: baggage spots filled / baggage spots left
- Estimated cost per person (poster manually enters an estimated total ride cost at MVP; see Section 5)
- GroupMe invite link (pasted in by the first poster)

The first person to post a trip sets it up. Anyone who lands in a similar time window can join the same post rather than creating a duplicate. We're not building any duplicate-detection or merge-suggestion tooling for MVP — users are expected to browse existing posts before creating a new one, so a new post is assumed to represent a real gap (different time window, different vehicle need, etc.) rather than an accident. We'll revisit if duplicate posts turn out to be a real problem in practice.

### 4.3 Joining a trip

A joining student declares their own bag count as part of signing up.

**Capacity is enforced.** Once a trip's seat count or bag count reaches the capacity implied by its selected vehicle type, the post stops accepting new joins. The post stays visible on the board (not hidden or removed) so people can still see it fill/empty live — if someone in the group leaves, the freed spot(s) reopen immediately and the post becomes joinable again.

**One active group at a time.** A user can only be signed up for one trip at a time. While in a group, other trips are still browsable (read-only), but joining is blocked until the user explicitly leaves their current group. On leaving, we show a message reminding them to tell the rest of the group (via GroupMe) that they're dropping out — this is deliberate friction, since a silent leave is functionally the same failure mode as a silent no-show.

**Group status indicator.** The app shows a persistent status bar/indicator with the user's current group (if any) — trip details and who else is in it. This is visible to the user at all times while signed into a group, so it's always clear which trip they're committed to.

Once a student joins, they're added to the trip's signup list, and the live counts update immediately.

The student is expected to join the GroupMe for that trip to coordinate actual pickup logistics with the rest of the group.

### 4.4 Trip completion and cleanup

A trip post is cleaned up (removed from the board) once the ride has actually departed, not simply once the scheduled flight time passes — people's plans shift, and a post should stay usable until the group is actually gone.

- Any member of the group can mark the trip as "departed" once the ride has left.
- If no one confirms departure within **1 hour after the scheduled departure time**, the post is automatically cleaned up.
- This confirmation is a simple boolean action, not a full check-in/attendance system — it exists purely to know when a post is stale enough to remove from the board.

### 4.5 Coordination

GroupMe is used purely for communication (confirming pickup time, deciding who orders the car, handling last-minute changes).

No in-app chat is built for MVP; GroupMe is sufficient for now.

## 5. Cost Estimation

MVP: the trip poster manually enters an estimated total ride cost, which the app divides evenly across current signups to show live "cost per person."

Future (v1.5): pull a live price estimate via the Uber API. Notes for later reference:

- Uber's price/fare estimate endpoints are free to use (no per-call fee) and only require a developer account and API credentials.
- Uber's terms require caching estimates rather than refetching constantly. For our use case (a post that sits for hours before departure) this is a natural fit.
- A read-only integration (price + product estimates) is a realistically scoped task, making it a reasonable near-term addition once the core matching flow is validated.

## 6. Trust & Reliability

The main failure mode identified: a student in a group backs out silently, leaving others stranded or misled.

MVP approach:

- No formal organizer role — this removes the single point of failure where one person's flakiness strands the whole group.
- GroupMe group chat is shared by all members, so if someone says they're bailing, it's visible to everyone in the group.
- Leaving a group inside the app is deliberately not frictionless: leaving requires an explicit action, and the user is prompted to notify the group via GroupMe when they do. This doesn't prevent silent bail-outs, but it removes the "I just forgot to update anything" excuse and keeps in-app state (spot counts) honest.
- Since a user can only be in one group at a time, group membership is unambiguous — there's no risk of someone appearing "joined" to multiple trips at once, which keeps the live counts and the status indicator trustworthy.
- No automated bail-detection or confirmation system at MVP — will observe in real use before over-building a solution.

Deferred ideas (v2+, not building now):

- Automated confirmation text (e.g. via Twilio) sent to the group ahead of pickup time, with a visible flag if no one confirms.
- Lightweight post-trip reliability tracking (e.g. "X trips completed, no-show count") self-reported by group members.

## 7. Data Model (rough sketch)

- **users**: id, school email, name, phone (optional/future), verified school domain, current_signup_id (nullable — enforces the one-active-group-at-a-time rule)
- **trips**: id, direction (to_airport / from_airport), flight date/time, pickup location, dropoff location, vehicle_type, seat_capacity, bag_capacity, groupme_link, estimated_total_cost, status (open / full / departed / expired), created_by, created_at
- **signups**: id, trip_id, user_id, bag_count, joined_at, left_at (nullable)

Live spot count and bag count are computed from active `signups` rows (`left_at IS NULL`) against `seat_capacity` / `bag_capacity` on the trip, which are set from the poster's selected vehicle type.

Trip `status` transitions: `open` → `full` (capacity reached) → back to `open` if someone leaves and frees a spot → `departed` (member confirms) or `expired` (no confirmation within 1 hour of scheduled departure) → removed from the board.

## 8. Tech Stack

Next.js (frontend/framework) + Supabase (Postgres, auth, realtime)

Rationale:

- Supabase auth supports domain-restricted signup out of the box
- Supabase's realtime layer pushes live database changes to the frontend, which directly covers the "live spot/bag counts" requirement without building polling or websockets manually.
- Postgres (relational) fits the data model naturally: a trip has many signups, each with its own bag count. A better fit than a NoSQL alternative like Firebase.
- Uber price estimate calls (future) can be added later as a serverless function (Vercel API route) without restructuring the app.

Why web over native mobile for MVP:

- Fastest to ship and iterate on solo.
- No app store review delay.
- A shareable link is a better fit for the seeding strategy (posting in group chats, QR codes) than asking people to download an app.
- Push notifications and app-store polish are advantages of native, but not worth the build overhead before the core matching concept is validated on one campus.

## 9. Open Questions / Next Steps

- Finalize the vehicle type reference table (seats + large bags per Uber product type) used to set capacity when posting.
- Decide on exact time-window tolerance for showing "nearby" trips on the board (e.g. ±45 min) — likely needs tuning after real usage data.
- Plan seeding strategy for first cohort: target a specific break (e.g. Thanksgiving), recruit first ~20–30 posts manually via group chats/dorm channels/flyers, since the board is only useful once it has real density.
- Revisit organizer-less, symmetric-group model after first real usage to see if any coordination gaps emerge that need addressing.
- Revisit whether duplicate/near-duplicate trip posts turn out to be a real problem once there's real usage density, and whether any tooling is needed.
