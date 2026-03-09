# LDB 2026 — Auction Command Center

A live fantasy baseball auction tracker built for Lucid Dream Baseball.

## Features
- **Rankings** — Batters / SP / RP with BATX/ATC and OOPSY projections side-by-side
- **Live Auction** — Nominate players, record sales, real-time valuation recalculation
- **League Board** — All 16 team budgets, slots, wins, and threat level
- **FRY Lens** — Toggle on FRY-specific signals: BUY / TARGET / RISKY / RISING
- **Auto-recalc** — Every sale updates all player values based on remaining pool $

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Generate data (run once, re-run to refresh)
```bash
python generate_data.py
```
This reads all projection CSVs from `/mnt/project` and writes `src/data/ldb_data.js`.

To use your own CSV paths, edit the `INPUT_DIR` variable at the top of `generate_data.py`.

### 3. Run locally
```bash
npm run dev
```

### 4. Deploy to Vercel
```bash
npm run build
# then push to GitHub and connect to Vercel, or:
npx vercel --prod
```

---

## Position File (optional)

To enable positional scarcity tracking, create `player_positions.csv` in the project data dir:

```csv
Name,Positions
Aaron Judge,"RF,OF"
Shohei Ohtani,"OF,DH"
Bobby Witt Jr.,SS
Tarik Skubal,SP
Edwin Díaz,RP
```

Then re-run `python generate_data.py`.

---

## Workflow During Auction

1. Open **Rankings** tab — browse by Batters / SP / RP
2. Enable **FRY Lens** for bid signals
3. Click **NOM →** next to any player to pre-fill the auction form
4. Switch to **Live Auction** tab, select winning team + enter final price
5. Click **CONFIRM SALE** — values update instantly across all tabs
6. **League Board** shows real-time budget/slot tracking for all 16 teams

---

## Updating Rankings Mid-Season

1. Drop in updated CSVs
2. Re-run `python generate_data.py`
3. Rebuild: `npm run build`
4. Redeploy

---

## Files

```
ldb-auction/
├── generate_data.py          ← Run this to bake data
├── src/
│   ├── data/ldb_data.js      ← Generated (do not edit manually)
│   ├── store/auctionStore.jsx ← Zustand state + valuation engine
│   └── components/
│       ├── Header.jsx
│       ├── RankingsView.jsx  ← Dual projection rankings table
│       ├── AuctionView.jsx   ← Live sale entry + log
│       └── LeagueView.jsx    ← 16-team league board
```
