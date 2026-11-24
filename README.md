# Harbour.Space@UTCC Open House

vinext (Next.js API on Vite) + Cloudflare Workers, D1, R2 and a Durable Object for live updates.

## Pages

| Route          | Used on               | Access                 |
| -------------- | --------------------- | ---------------------- |
| `/station`     | Campus PC (QR + play) | Staff password         |
| `/leaderboard` | Second PC             | Staff password         |
| `/admin`       | Staff                 | Staff password         |
| `/play`        | Guest phone (via QR)  | Public                 |

## Flow

1. The guest scans the QR code on `/station` and picks a nickname on `/play`. All 4 activity timers start then.
2. The phone shows a 4-character code and the task details.
3. At the station the guest types the code, picks an activity (`[1]`–`[4]`) and answers.
4. A wrong answer, or running out of guesses in activity 2, plays a random university ad. The guest can retry only after it ends.
5. Each activity time is `finish − name pick`. The leaderboard ranks guests who finished all 4 by the sum of the 4 times, and updates live over WebSocket.

## Activities

1. **DECODE**: images in admin order. Answers are letters A–Z only, case-insensitive.
2. **BINSRCH**: 1–100 with 7 guesses. The game never fixes a number; it answers toward the larger remaining range, so only halving the range each time is guaranteed to win. On failure it reveals a number that fits every hint.
3. **COLORS**: 3 random enabled brands, each with the real color plus 3 near-identical decoys. A wrong pick plays an ad, then a fresh set of 3 brands.
4. **ASKAROUND**: a multiple-choice question set in admin.

## Develop

```sh
bun install
echo "STAFF_PASSWORD=devpassword" > .dev.vars
bun run dev          # http://localhost:5173  (local D1/R2/DO are simulated)
bun test             # game logic tests
```

## Deploy (Cloudflare free plan works)

```sh
bunx cf auth login
bun run deploy                                   # provisions D1, R2 and the Durable Object
bunx cf workers secrets update STAFF_PASSWORD    # set the staff password
```

Then open `/admin` to upload activity 1 images, check the brand list, set the activity 4 question and upload ad videos (MP4/WebM, under 100 MB each).
