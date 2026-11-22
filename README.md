[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/c6mnxczqw8-beep/makefun-radar-20261122/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/c6mnxczqw8-beep/makefun-radar-20261122/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

A dashboard that reads one sealed snapshot of DefiLlama protocol data and
ranks every protocol that records no token yet by an **implied launch value**
— what its token would be worth if its record stayed as it is — each with a
concrete plan for farming it before a launch.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18+, standard library only, no network. The program writes
`board.json`, the `dashboard/` (with its data in `rows.js` beside the page),
the `screenshots/` and `dossier.json` into the output directory. It is
deterministic: the same snapshot always writes the same bytes.

## The model

Nothing is priced off a list of names. Every figure derives from the
snapshot itself:

```
implied value = TVL × peer multiple × momentum × track record × product factor
```

- **Peer multiple** — the median market-cap-to-TVL ratio of the protocols
  whose token already trades, taken per category, then per category family,
  then over the whole launched set (whichever rung has at least four peers).
  The launched set is shown on the dashboard, kept separate from the board.
- **Momentum** — the seven-day TVL change, clamped: +80% earns ×1.32,
  −40% earns ×0.84, unreported earns ×1.00.
- **Track record** — how long the protocol has run with no token: ×0.80 on
  day one rising to ×1.20 at three years; an unreported start earns ×0.90.
- **Product factor** — a wrapped, staked or bridged product of an asset that
  already trades (or an exchange) has no launch of its own: its figure is a
  claim on the underlying asset, discounted to ×0.03 and flagged on the
  board. The classification uses only snapshot fields — category and the
  name tests the snapshot's own watchlist rule states.

The board covers the whole watchlist and every other protocol in the
snapshot that records no token (342 rows on the sealed snapshot). Each row's
detail view shows the four factors behind its value and a farm plan whose
steps name an action, a cost and a time.

## Layout

- `main.ts` — the program: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the value model and the farm-plan generator.
- `dashboard/` — the page: board, filters, detail view, launched peer set.
- `screenshots/` — the board, a detail view and a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, as the bounty
  prescribes; `main.ts` writes `dossier.json` with its `buildDossier`.

## License

MIT — see `LICENSE`.
