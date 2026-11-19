# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/satriax30-commits/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/satriax30-commits/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (radar-2) ranks every pre-token protocol in a sealed DefiLlama snapshot by what its
launch would be worth, and shows a reader how to farm each one. The model is one function of the
snapshot's own figures — TVL, seven-day growth, how long the protocol has run with no token, and
how many chains it spans — applied to every protocol alike, with no name ever special-cased. The
40-protocol watchlist is the floor: the board also ranks every rankable pre-token protocol below
it, sets aside wrapped, staked and bridged products whose token already trades, and keeps
live-token protocols apart with the market's own values. The dashboard is a static page with a
ranked board, a detail view for every protocol with its model breakdown and seven-step farm plan,
category and watchlist filters, sorting, and a what-if sandbox that recomputes the board live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

Node 22 or later, standard library only, no network. The program writes `out/board.json`,
`out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Open
`out/dashboard/index.html` in a browser to use the radar.

---

<sub>Entered on [make.fun](https://make.fun/?ref=kssgyf66&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
