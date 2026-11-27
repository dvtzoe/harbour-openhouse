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

1. The guest scans the QR code on `/station` and picks a nickname and the major they are interested in on `/play`. Task 1's timer starts then.
2. Tasks unlock one at a time, in order 1 → 2 → 3 → 4. The phone shows a 4-character code and only the current task; later tasks stay hidden.
3. At the station the guest types the code and lands straight in their current task. After a solve, the next task opens automatically when it is played at the station (2 and 3). Otherwise the station logs out so the guest can go find the answer.
4. A wrong answer, or running out of guesses in activity 2, plays a random university ad. The guest can retry only after it ends.
5. Each task's time runs from when it unlocked (the previous solve, or the name pick for task 1) to its own solve. The leaderboard ranks guests who finished all 4 by total time (name pick → last solve, which equals the sum of the 4 task times) and updates live over WebSocket.

## Activities

1. **DECODE**: one image picked at random per guest from the admin list (kept across wrong answers). Answers are letters A–Z only, case-insensitive.
2. **BINSRCH**: 1–100 with 7 guesses. The game never fixes a number; it answers toward the larger remaining range, so only halving the range each time is guaranteed to win. On failure it reveals a number that fits every hint.
3. **COLORS**: 3 random enabled brands, each with the real color plus 3 near-identical decoys. A wrong pick plays an ad, then a fresh set of 3 brands.
4. **ASKAROUND**: "What major is <senior> from?" Every major is a choice. The senior is picked at random from the major the guest chose at sign-up (any senior if that major has none yet) and re-picked after each wrong answer. Majors and seniors are managed in admin.

## Languages (English / Thai)

Every page has an **EN | TH** switch in the top bar. On a first visit the language follows the browser; after that the choice is kept in a cookie. Switching is instant and doesn't reload, so a guest logged in at the station keeps their place.

All texts live in two plain files: `messages/en.json` and `messages/th.json`. There are two ways to change them, and neither needs code:

- **In the repo:** edit the JSON file and redeploy.
- **Live, in `/admin` → TRANSLATIONS:** search for a text, edit it, then leave the box (or press ENTER) to save. It shows on the next page load, with no redeploy. Clearing a box goes back to the JSON text. The **⇩ en.json / th.json** buttons download the files with your edits included, so you can commit them.

When editing, keep these exactly as they are:

- `{name}`-style placeholders. They are filled in by the app, and `{event}` is always "Harbour.Space@UTCC".
- `<y>…</y>` (yellow), `<em>…</em>` and `<b>…</b>` tags.

`bun test` checks that both files have the same keys, placeholders and tags. Names typed in admin (majors, seniors, brands, ad titles) are shown as entered and are not translated.

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

Then open `/admin` to upload activity 1 images, check the brand list, check the majors, add activity 4 seniors and upload ad videos (MP4/WebM, under 100 MB each).
