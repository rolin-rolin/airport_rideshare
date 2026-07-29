# Trip Board UI — Manual Verification

Checklist for manually verifying the trip board UI (tabs, trip cards, post-trip form, join/leave, group-status bar) end-to-end against real Supabase data.

- [x] `npm run dev`, log in via magic link, confirm the board renders both tabs with real trip data (seed via Supabase directly if the board is empty). Verified 2026-07-29 against local Supabase.
- [x] Post a trip via `/dashboard/new`, confirm it appears on the correct tab with correct capacity/price, and that the poster is auto-joined (shows in `GroupStatusBar`).
- [x] From a second account (or by clearing the active signup), join the trip, confirm live counts update on next page load and capacity caps are enforced (join blocked once full). Verified via the bag-capacity path: board correctly shows "Full" once bags are exhausted even with seats still open.
- [x] Leave the trip, confirm the GroupMe reminder appears and the group-status bar clears.
- [x] Join a trip then leave it as the last remaining member, confirm it disappears from the board immediately (abandoned).
- [ ] Check mobile viewport (browser devtools) for card layout/whitespace/scannability against the brief. **Not verified** — the browser-automation tool used for this pass could not actually resize the viewport (window.innerWidth stayed at 1709px despite the resize call reporting success); needs a manual pass or a differently-configured tool.
