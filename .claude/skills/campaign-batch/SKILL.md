---
name: campaign-batch
description: Run one batch of the launch email campaign - report where sending left off, send the next batch, monitor it, then report bounces, complaints, opt-outs, new signups and new trips. Use when the user asks where the campaign stands, to send or start the next batch or day, or how the last batch did.
---

# Launch email campaign: one batch's cycle

All state lives in the production database (`email_campaign_recipients`) and in Resend, so nothing here depends on an earlier chat. Everything goes through `scripts/send-campaign.mjs`, run from the repo root.

## 1. Where we left off

```
node scripts/send-campaign.mjs report
```

Prints one line per batch (a run of sends with no gap over 30 minutes), the pending count, and opt-outs / new users / new trips since the newest batch started. Then check the previous batch's delivery (slow, about 4 emails a second):

```
node scripts/send-campaign.mjs results --last <size of that batch>
```

Tell the user: which batch is next, how the previous one did, and the batch you propose.

## 2. The schedule

| Step | Emails | Interval | Takes about | Total sent when done |
|---|---|---|---|---|
| 1 | 100 | 20s | 35 min | 100 |
| 2 | 500 | 10s | 1.5 h | 600 |
| 3 | 1,200 | 10s | 3.5 h | 1,800 |
| 4 | 2,000 | 5s | 3 h | 3,800 |
| 5 | everything still pending | 5s | 3.5 h | all |

Pick the next step from the total sent in `report`, not from its batch count: a step that was interrupted and resumed more than 30 minutes later shows up there as two batches. If the total sits between two rows, finish the unfinished step first: limit = that row's total minus the total sent. The plan was one step a day, but the user may run more than one in a day.

Only move up a step if the previous batch was clean: no spam complaints, bounces under 4%, no failed sends. Otherwise repeat the previous size and say why.

## 3. Send

Never send without an explicit go-ahead in this conversation ("start day 2", `/campaign-batch send`). A request to see the status is not a go-ahead.

Run it in the background so it survives a long batch:

```
caffeinate -i node scripts/send-campaign.mjs send --limit <n> --interval <s>
```

A rerun never emails anyone twice, and opt-outs made mid-batch are honored.

## 4. Monitor

About every 5 minutes until the send exits:

```
node scripts/send-campaign.mjs status
node scripts/send-campaign.mjs results --last <number sent so far in this batch>
```

A Monitor expires after 30 minutes; re-arm it for longer batches.

Stop the send immediately, and tell the user, on any of:

- a spam complaint (`complained`) - Resend's limit is 0.08%, so one is already too many at these sizes
- bounces over 4% of this batch
- failing sends (the script itself stops after 3 in a row)

## 5. After the batch

```
node scripts/send-campaign.mjs results --last <batch size>
node scripts/send-campaign.mjs report
```

Report as one small table: sent, delivered, bounced, complained, opt-outs, new users, new trips, and whether the site responded. `report` counts from the start of the newest batch; pass `--since <iso time>` for a different window. Recent emails may still show `sent` rather than `delivered` for a few minutes.

Site visits can't be measured: the site has no analytics and Resend open/click tracking is off.

## Notes

- `results` needs the full-access `RESEND_API_KEY` in `.env.local`; a send-only key gets a 401.
- The script targets production unless `--local` is the first flag.
- The list is cold (not opted in). The user has decided to send anyway with an unsubscribe link; don't re-argue it, just hold the complaint and bounce limits above.
