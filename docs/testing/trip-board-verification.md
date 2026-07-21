# Trip Board UI — Manual Verification

Checklist for manually verifying the trip board UI (tabs, trip cards, post-trip form, join/leave/mark-departed, group-status bar) end-to-end against real Supabase data.

- [ ] `npm run dev`, log in via magic link, confirm the board renders both tabs with real trip data (seed via Supabase directly if the board is empty).
- [ ] Post a trip via `/dashboard/new`, confirm it appears on the correct tab with correct capacity/price, and that the poster is auto-joined (shows in `GroupStatusBar`).
- [ ] From a second account (or by clearing the active signup), join the trip, confirm live counts update on next page load and capacity caps are enforced (join blocked once full).
- [ ] Leave the trip, confirm the GroupMe reminder appears and the group-status bar clears.
- [ ] Mark a trip departed, confirm it disappears from the board.
- [ ] Check mobile viewport (browser devtools) for card layout/whitespace/scannability against the brief.
