# Fogbound

A daily deduction game for Reddit, built on Devvit Web.

Every night, rocks hide in the fog of a small bay. You shine lamps from the shore and watch where the light comes out: lost, bent, or thrown straight back. Then you drop buoys where you think the rocks are and chart the fog.

**The twist is that the shore is shared.** When you fire a lamp, your oil keeps it lit for the next 3 keepers. They can borrow your beam for half price, up to 3 a day, and every borrow is credited to you. When a lamp's oil runs out, someone has to relight it. So the community isn't a leaderboard bolted on the side. It's a resource you trade with all day.

## The daily loop

1. A scheduled job at 00:00 UTC posts tonight's fog: 3 rocks on Monday, 4 on other days. It pins the rules and unpins yesterday's post.
2. **Fire** a lamp for 1, or **borrow** a lit one for ½. Beams follow Black Box optics:
   - A rock dead ahead swallows the beam.
   - A rock on a forward diagonal bends it away.
   - Two rocks on the forward diagonals, or one grazing the shore, send it straight back.
3. Drop your buoys and chart the fog. Each buoy on open water costs 5.
4. The fog lifts. You see the true path of every beam you used, where the crowd put its buoys, your score against par, and how many keepers your lamps guided.
5. Yesterday's thread gets a results comment naming the **brightest lamp**: the keeper whose beams were borrowed most.

Par is what an expert solver needs. A greedy solver picks the most informative lamp each turn, using the full space of 635,376 possible rock placements. Every daily puzzle is verified to have exactly one solution.

## What Black Box never had

Existing Black Box apps help in only two ways: they show you the true beam paths (which spoils the puzzle) or they sell hints. Fogbound adds three things on top of the shared lamps:

- **Theory check.** Once your buoys are out, every lamp you've used shows ✓ or ✗, meaning your chart does or doesn't explain that beam. Tap a ✗ to see a dashed ghost path of where your chart would send it. It teaches the optics without revealing a single rock.
- **Fog meter.** A live count of the rock charts that still fit your beams: 635,376 → 2,452 → 1. When it isn't 1 yet, you face a real choice: gamble on your chart now, or pay for another beam. It's computed in the browser by enumerating placements, tracing only the lamps you've fired and giving up on each placement at the first mismatch. It never touches the rocks.
- **Beam log.** WordleBot for the fog. After charting, each beam is graded against the most informative lamp available at that moment: how many charts it cleared, what the expert would have lit instead, a skill score from 0 to 100, and the expert's full line.

## Why the oil runs out

Bot simulations (`npx tsx scripts/sim.ts 0.5 3 60 5 3`) were used to tune the economy:

| Rule | Keepers with credit | Score, early vs late |
|---|---|---|
| Unlimited borrowing | n/a: everyone borrows everything, nobody fires | broken |
| Cap 3, lamps never burn out | 21% (whoever plays at midnight wins) | flat |
| **Cap 3, 3 borrows of oil per lamp** | **86%** | **flat, fair across timezones** |

## Reddit-native bits

- A daily post from the scheduler, with a pinned rules comment and a results comment on yesterday's thread.
- Streak and "guided N" user flair.
- A spoiler-free result comment, posted as the player only when they tap Share.
- A subscribe prompt on the result card.
- Archive posts stay playable in unranked practice mode, so judges can open any day.
- Devvit Journeys events: `App.Ready`; journey start on the first beam; progress per buoy placed; interactions for borrow, help, share and subscribe; journey end with win and score.

## Architecture

```
src/shared/beam.ts     ray optics, padded-grid fast tracer, config space, uniqueness, solver
src/shared/puzzle.ts   daily generation (salted), scoring in half-points, economy constants
src/server/core/       Redis store (lamps, runs, credit, stats), rollover + posting
src/server/routes/     /api/init /fire /borrow /submit /share /subscribe, scheduler, menu, triggers
src/client/            splash (inline), game (expanded), Bay SVG board, coach, result card
scripts/sim.ts         economy simulation
test/server.test.ts    end-to-end API tests against an in-memory Devvit fake
```

- **The server is the source of truth.** Rocks never reach a client before that player has charted the fog.
- **Tomorrow's rocks can't be computed from this source.** They are seeded by a random per-install salt stored in Redis.
- **Generation is fast:** worst case about 1.1 s per day, including building the configuration space.

## Develop

```bash
npm install
npm test            # engine unit tests + server e2e + typecheck
npm run build
npx vite build && (cd dist/client && python3 -m http.server 8787)
# open http://localhost:8787/game.html?state=fresh|mid|done&crowd=240&logged=0
```

## Ship (hackathon)

```bash
npx devvit login
npm run dev        # devvit playtest on r/fogbound_dev
npx devvit upload  # private upload; do NOT publish during the hackathon
```

Then install the app on the demo subreddit and use the mod menu item **Fogbound: post today's fog**. The scheduler takes over from there.
