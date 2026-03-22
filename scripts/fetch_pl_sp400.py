#!/usr/bin/env python3
"""Fetch Pitcher List Top 400+ SP rankings table from the SP 1-20 article (embeds full list)."""
import csv
import re
import sys
import urllib.request

URL = "https://pitcherlist.com/top-400-starting-pitchers-for-fantasy-baseball-2026-sp-rankings-1-20/"


def main() -> int:
    req = urllib.request.Request(
        URL,
        headers={"User-Agent": "Mozilla/5.0 (compatible; ldb-auction/1.0)"},
    )
    raw = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", errors="replace")
    lines = raw.splitlines()
    rows: list[tuple[str, str, str, str, str, str]] = []
    in_table = False
    for line in lines:
        s = line.strip()
        if s.startswith("| Rank | Player | Tier |"):
            in_table = True
            continue
        if not in_table:
            continue
        if not s.startswith("|"):
            break
        if re.match(r"^\|\s*---", s):
            continue
        parts = [p.strip() for p in s.split("|")[1:-1]]
        if len(parts) < 6:
            continue
        rank_s, player_cell, tier, tier_name, throws, team = (
            parts[0],
            parts[1],
            parts[2],
            parts[3],
            parts[4],
            parts[5],
        )
        m = re.search(r"\[([^\]]+)\]", player_cell)
        name = m.group(1) if m else player_cell
        rows.append((rank_s, name, tier, tier_name, throws, team))

    if len(rows) < 300:
        print(f"Expected many rows, got {len(rows)}", file=sys.stderr)
        return 1

    out_path = sys.argv[1] if len(sys.argv) > 1 else "data/pitcherlist_sp_top400_2026.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["pl_rank", "player", "tier", "tier_name", "throws", "team"])
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
