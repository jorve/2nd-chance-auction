#!/usr/bin/env python3
"""
LDB 2026 Data Generation Script
================================
Reads all projection CSVs + draft board + RFA file.
Produces src/data/ldb_data.js with everything baked in for the React app.

Run from the repo root:
  python generate_data.py

Required source files (set INPUT_DIR below):
  2026_LDB_Draft_Board__2026_Board.csv
  2026_LDB_Draft_Board__RFA_Rights.csv
  2026_BATX_Batters_Projections.csv
  2026_OOPSY_Batters_Projections.csv
  2026_ATC_SP_Projections.csv
  2026_OOPSY_SP_Projections.csv
  2026_ATC_RP_Projections.csv
  2026_OOPSY_RP_Projections.csv
  player_positions.csv  (optional — placeholder format: Name,Positions)
"""

import csv, json, statistics, re
from pathlib import Path
from difflib import SequenceMatcher

# ── PATHS ──────────────────────────────────────────────────────────────────────
INPUT_DIR  = Path("/mnt/project")
OUTPUT_JS  = Path("/home/claude/ldb-auction/src/data/ldb_data.js")

DRAFT_BOARD   = INPUT_DIR / "2026_LDB_Draft_Board__2026_Board.csv"
RFA_FILE      = INPUT_DIR / "2026_LDB_Draft_Board__RFA_Rights.csv"
BATX_BATTERS  = INPUT_DIR / "2026_BATX_Batters_Projections.csv"
OOPSY_BATTERS = INPUT_DIR / "2026_OOPSY_Batters_Projections.csv"
ATC_SP        = INPUT_DIR / "2026_ATC_SP_Projections.csv"
OOPSY_SP      = INPUT_DIR / "2026_OOPSY_SP_Projections.csv"
ATC_RP        = INPUT_DIR / "2026_ATC_RP_Projections.csv"
OOPSY_RP      = INPUT_DIR / "2026_OOPSY_RP_Projections.csv"
CBS_BAT_ELIG  = Path(__file__).parent / "data" / "CBS_batter_elig.csv"
CBS_SP_ELIG   = Path(__file__).parent / "data" / "CBS_SP_elig.csv"
CBS_RP_ELIG   = Path(__file__).parent / "data" / "CBS_RP_elig.csv"

# ── CONSTANTS ──────────────────────────────────────────────────────────────────
MIN_PA  = 200
MIN_GS  = 10
MIN_IP  = 20
HIT_SPLIT = 0.50
SP_SPLIT  = 0.30
RP_SPLIT  = 0.20

FRY_TEAM = "FRY"
FRY_KEEPERS = ["Ronald Acuña Jr.", "Rafael Devers", "Brent Rooker",
               "Riley Greene", "Corbin Carroll", "Cal Raleigh",
               "Drew Rasmussen", "Matthew Liberatore"]

RFA_TEAM_MAP = {
    "aids":"AIDS","fish fry":"FRY","balks":"BALK","choice":"CHOICE",
    "cornballers":"CORN","pollos":"POLL","nate":"NATE","neo":"NEO",
    "roof":"ROOF","tones":"TONES","wind":"WIND","ichi":"ICHI",
    "work":"WORK","izzy":"IZZY","ipa":"IPA","pwrs":"PWRS",
    "balk":"BALK","fry":"FRY","pollos hermanos":"POLL",
}

# Position eligibility slots per team (used for scarcity)
POS_SLOTS_PER_TEAM = {"C":1,"1B":1,"2B":1,"3B":1,"SS":1,"OF":3,"CF":1,"RF":1,"UT":1,"SP":6,"RP":3}

# ── HELPERS ────────────────────────────────────────────────────────────────────
def norm(name):
    return (name.lower().strip()
        .replace("á","a").replace("é","e").replace("í","i")
        .replace("ó","o").replace("ú","u").replace("ü","u").replace("ñ","n")
        .replace(".","").replace("-"," ").replace("'","")
        .replace(" jr","").replace(" iii","").replace(" ii","")
        .replace("  "," ").strip())

def abbrev_match(short, full):
    s, f = norm(short).split(), norm(full).split()
    if len(s) < 2 or len(f) < 2: return False
    if s[-1] != f[-1]: return False
    return f[0].startswith(s[0].replace(".",""))

def fuzzy(a, b, thresh=0.88):
    return SequenceMatcher(None, norm(a), norm(b)).ratio() >= thresh

def fv(row, col):
    try: return float(row.get(col, 0) or 0)
    except: return 0.0

def calc_aSB(row):
    sb, cs = fv(row,"SB"), fv(row,"CS")
    return sb * (sb/(sb+cs)) if (sb+cs) > 0 else 0.0

def calc_vijay_season(row):
    """Season-total VIJAY — used for valuation engine (cumulative matters for H2H)."""
    inn, gs = fv(row,"IP"), fv(row,"GS")
    sv, hd  = fv(row,"SV"), fv(row,"HLD")
    bs, l   = fv(row,"BS"), fv(row,"L")
    inndgs  = (inn/gs) if gs > 0 else 0
    return ((inn - (inndgs*gs) + sv*3 + hd*3) / 4) - ((bs+l)*2)

def calc_vijay_per_g(row):
    """VIJAY per game appearance — used for display."""
    g = fv(row,"G")
    if g == 0: return 0.0
    return calc_vijay_season(row) / g

def calc_mgs_season(row):
    """Season-total MGS — used for valuation engine."""
    gs = fv(row,"GS")
    if gs == 0: return 0.0
    inn = fv(row,"IP") / gs
    k   = fv(row,"SO") / gs
    ha  = fv(row,"H")  / gs
    er  = fv(row,"ER") / gs
    bbi = fv(row,"BB") / gs
    mgs = (3*inn) + (2*(inn-4)) + k - (2*ha) - (4*er) - bbi
    return mgs * gs

def calc_mgs_per_gs(row):
    """MGS per start — used for display."""
    gs = fv(row,"GS")
    if gs == 0: return 0.0
    return calc_mgs_season(row) / gs

def is_unavailable(proj_name, unavail_set):
    n = norm(proj_name)
    for taken in unavail_set:
        t = norm(taken)
        if n == t: return True
        if abbrev_match(taken, proj_name): return True
        if SequenceMatcher(None, n, t).ratio() > 0.90: return True
    return False

def get_rfa_team(proj_name, rfa_norm):
    n = norm(proj_name)
    if n in rfa_norm: return rfa_norm[n]
    for rn, t in rfa_norm.items():
        if SequenceMatcher(None, n, rn).ratio() > 0.85: return t
    return ""

def compute_values(players, cat_weights, budget):
    for key, (higher, weight) in cat_weights.items():
        raw_key = f"_raw_{key}"
        if raw_key not in players[0]:
            for p in players:
                p[raw_key] = fv(p, key)
    for key, (higher, weight) in cat_weights.items():
        vals = [p[f"_raw_{key}"] for p in players]
        mean  = statistics.mean(vals) if vals else 0
        stdev = statistics.stdev(vals) if len(vals) > 1 else 1.0
        for p in players:
            z = (p[f"_raw_{key}"] - mean) / stdev if stdev else 0.0
            if not higher: z = -z
            p[f"_z_{key}"] = z * weight
    for p in players:
        p["LDB_Score"] = sum(p[f"_z_{key}"] for key in cat_weights)
    players.sort(key=lambda x: x["LDB_Score"], reverse=True)
    pos_total = sum(p["LDB_Score"] for p in players if p["LDB_Score"] > 0)
    for p in players:
        if p["LDB_Score"] > 0 and pos_total > 0:
            p["Est_Value"] = max(1, round((p["LDB_Score"]/pos_total)*budget))
        else:
            p["Est_Value"] = 1
    return players

# ── DRAFT BOARD ────────────────────────────────────────────────────────────────
def parse_draft_board(path):
    with open(path, encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))

    teams = []
    for col in range(2, len(rows[0]), 3):
        abbr = rows[0][col].strip() if col < len(rows[0]) else ""
        if not abbr or abbr == "REM": continue
        try: budget = float(rows[1][col+1]) if col+1 < len(rows[1]) else 0
        except: budget = 0
        try: slots = int(rows[0][col+1]) if col+1 < len(rows[0]) else 0
        except: slots = 0
        gm = rows[1][col].strip() if col < len(rows[1]) else ""
        teams.append({"abbr":abbr, "col":col, "budget_rem":budget, "slots_rem":slots, "gm":gm})

    STOP_LABELS = {"MISC","LUX","MCQ","INN","$$$","%"}
    SKIP_LABELS = {"SN1","SN2","SN3","SN4","SN5","SN6",""}
    aa_section = False
    owned = {}   # name -> {team, salary, contract, pos}
    aa_names = set()

    for row in rows:
        label = row[0].strip() if row else ""
        if label == "AA": aa_section = True
        if label in STOP_LABELS and aa_section: aa_section = False
        if label in SKIP_LABELS and label != "AA": continue

        for t in teams:
            col = t["col"]
            name = row[col].strip() if col < len(row) else ""
            if not name: continue
            sal_str = row[col+1].strip() if col+1 < len(row) else "0"
            contract = row[col+2].strip() if col+2 < len(row) else ""
            try: salary = float(sal_str)
            except: salary = 0.0

            if aa_section:
                aa_names.add(name)
            elif label not in SKIP_LABELS and label not in STOP_LABELS and label != "AA":
                owned[name] = {"team":t["abbr"], "salary":salary, "contract":contract, "pos":label}

    teams_out = {}
    for t in teams:
        teams_out[t["abbr"]] = {
            "abbr": t["abbr"],
            "gm": t["gm"],
            "budget_rem": t["budget_rem"],
            "slots_rem": t["slots_rem"],
            "budget_initial": t["budget_rem"],
            "slots_initial": t["slots_rem"],
        }

    return {
        "teams": teams_out,
        "total_budget": sum(t["budget_rem"] for t in teams),
        "owned": owned,
        "aa_names": list(aa_names),
        "all_unavailable": set(owned.keys()) | aa_names,
    }

# ── RFA ────────────────────────────────────────────────────────────────────────
def parse_rfa(path):
    rfa = {}
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            if len(row) >= 2 and row[0].strip():
                player = row[0].strip()
                team_raw = row[1].strip().lower()
                team = RFA_TEAM_MAP.get(team_raw, team_raw.upper())
                rfa[norm(player)] = team
    return rfa

# ── POSITIONS (CBS eligibility files) ─────────────────────────────────────────
# CBS Player column format: "Name POS1,POS2 | TEAM"  (pipe separates name+pos from team)
# Known position tokens — anything else in that slot is part of the name
KNOWN_POS = {"C","1B","2B","3B","SS","OF","CF","RF","LF","DH","INF","U","SP","RP","P"}

def _parse_cbs_player_col(raw):
    """Parse a CBS 'Player' cell like 'Aaron Judge RF,OF | NYY'.
    Returns (clean_name, [positions], mlb_team).
    """
    raw = raw.strip().strip('"')
    if "|" not in raw:
        return raw.strip(), [], ""
    left, right = raw.split("|", 1)
    left = left.strip()
    mlb_team = right.strip()
    # Last space-separated token before pipe holds the position codes
    parts = left.rsplit(" ", 1)
    if len(parts) == 2:
        pos_str = parts[1].strip()
        pos_candidates = [p.strip() for p in pos_str.split(",")]
        if all(p in KNOWN_POS for p in pos_candidates if p):
            return parts[0].strip(), pos_candidates, mlb_team
    return left, [], mlb_team

def parse_positions_cbs(bat_path, sp_path, rp_path):
    """Parse all three CBS eligibility files and return a unified {norm_name: [positions]} map.
    Uses (norm_name, mlb_team) keying internally to resolve same-name collisions,
    then falls back to norm_name-only for the final lookup map.
    """
    # Primary: keyed by (norm_name, mlb_team) — most specific
    pos_by_name_team = {}
    # Secondary: norm_name -> list of (positions, mlb_team) tuples seen
    pos_by_name = {}

    def ingest(path, skip_rows=2):
        if not path.exists():
            print(f"  WARNING: {path.name} not found — skipping")
            return
        with open(path, encoding="utf-8-sig") as f:
            lines = f.readlines()
        reader = csv.reader(lines[skip_rows:])
        for row in reader:
            if len(row) < 2:
                continue
            player_cell = row[1]
            if not player_cell or "|" not in player_cell:
                continue
            name, positions, mlb_team = _parse_cbs_player_col(player_cell)
            if not name or not positions:
                continue
            key_full = (norm(name), mlb_team.strip().upper())
            existing_full = pos_by_name_team.get(key_full, [])
            merged_full = existing_full + [p for p in positions if p not in existing_full]
            pos_by_name_team[key_full] = merged_full

            key_name = norm(name)
            entries = pos_by_name.get(key_name, [])
            # Merge positions across same name — keep union (two-way players, multi-pos)
            existing_pos = [p for e in entries for p in e[0]]
            new_pos = existing_full[:]
            entries_new = entries + [(positions, mlb_team.strip().upper())]
            pos_by_name[key_name] = entries_new

    ingest(bat_path)
    ingest(sp_path)
    ingest(rp_path)

    # Build final map: for each norm_name, if only one MLB team seen → simple merge
    # If multiple MLB teams seen → keep only positions shared across all entries (avoid SS/RP collision)
    pos_map = {}
    for norm_name, entries in pos_by_name.items():
        teams_seen = set(e[1] for e in entries)
        if len(teams_seen) == 1:
            # Same player, possibly multiple files → union all positions
            all_pos = []
            for pos_list, _ in entries:
                for p in pos_list:
                    if p not in all_pos:
                        all_pos.append(p)
            pos_map[norm_name] = all_pos
        else:
            # Multiple different MLB teams with same norm name — name collision
            # Keep only the entry with the most specific/populous MLB team data
            # Use longest position list as tiebreak (more data = more likely correct)
            best = max(entries, key=lambda e: len(e[0]))
            pos_map[norm_name] = best[0]

    return pos_map, pos_by_name_team

def get_positions(proj_name, pos_map, pos_by_name_team=None, mlb_team=""):
    """Look up positions for a player. Uses (name, team) key first if available to resolve collisions."""
    n = norm(proj_name)
    # Try precise (name, team) lookup first to avoid same-name collisions
    if pos_by_name_team and mlb_team:
        key = (n, mlb_team.strip().upper())
        if key in pos_by_name_team:
            return pos_by_name_team[key]
    if n in pos_map:
        return pos_map[n]
    for pn, pos in pos_map.items():
        if SequenceMatcher(None, n, pn).ratio() > 0.88:
            return pos
    return []

# ── BATTER RANKINGS ────────────────────────────────────────────────────────────
def build_batters(proj_path, unavail, rfa_norm, pos_map, pos_by_name_team, budget, system_name):
    with open(proj_path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    eligible = [r for r in rows if fv(r,"PA") >= MIN_PA and not is_unavailable(r["Name"], unavail)]
    for r in eligible:
        r["_raw_aSB"]  = calc_aSB(r)
        r["_raw_HR"]   = fv(r,"HR")
        r["_raw_R"]    = fv(r,"R")
        r["_raw_OBP"]  = fv(r,"OBP")
        r["_raw_OPS"]  = fv(r,"OPS")
        r["_raw_aRBI"] = fv(r,"RBI")
    cat_weights = {"OPS":(True,3.0),"OBP":(True,2.5),"HR":(True,2.0),
                   "aSB":(True,1.5),"R":(True,1.5),"aRBI":(True,1.0)}
    eligible = compute_values(eligible, cat_weights, budget)
    results = []
    for i, p in enumerate(eligible):
        tier = 1 if i<10 else 2 if i<30 else 3 if i<70 else 4 if i<140 else 5
        results.append({
            "id": f"{system_name}_b_{i}",
            "system": system_name,
            "rank": i+1, "tier": tier,
            "est_value": p["Est_Value"],
            "name": p["Name"], "team": p.get("Team",""),
            "g": round(fv(p,"G"),1), "pa": round(fv(p,"PA"),1),
            "hr": round(fv(p,"HR"),1), "r": round(fv(p,"R"),1),
            "obp": round(fv(p,"OBP"),3), "ops": round(fv(p,"OPS"),3),
            "rbi": round(fv(p,"RBI"),1), "sb": round(fv(p,"SB"),1),
            "asb": round(p["_raw_aSB"],1), "wrc_plus": round(fv(p,"wRC+"),1),
            "war": round(fv(p,"WAR"),2),
            "ldb_score": round(p["LDB_Score"],3),
            "rfa_team": get_rfa_team(p["Name"], rfa_norm),
            "positions": get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team","")),
            "is_fry_keeper": p["Name"] in FRY_KEEPERS,
        })
    return results

# ── SP RANKINGS ────────────────────────────────────────────────────────────────
def build_sp(proj_path, unavail, rfa_norm, pos_map, pos_by_name_team, budget, system_name):
    with open(proj_path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    eligible = [r for r in rows if fv(r,"GS") >= MIN_GS and not is_unavailable(r["Name"], unavail)]
    for r in eligible:
        r["_raw_MGS"]   = calc_mgs_season(r)
        r["_raw_K"]     = fv(r,"SO")
        r["_raw_ERA"]   = fv(r,"ERA")
        r["_raw_HRA"]   = fv(r,"HR")
        r["_raw_aWHIP"] = fv(r,"WHIP")
    cat_weights = {"MGS":(True,2.5),"K":(True,2.0),"ERA":(False,2.0),
                   "HRA":(False,1.5),"aWHIP":(False,1.5)}
    eligible = compute_values(eligible, cat_weights, budget)
    results = []
    for i, p in enumerate(eligible):
        tier = 1 if i<8 else 2 if i<20 else 3 if i<50 else 4 if i<100 else 5
        results.append({
            "id": f"{system_name}_sp_{i}",
            "system": system_name,
            "rank": i+1, "tier": tier,
            "est_value": p["Est_Value"],
            "name": p["Name"], "team": p.get("Team",""),
            "gs": round(fv(p,"GS"),1), "ip": round(fv(p,"IP"),1),
            "k": round(fv(p,"SO"),1), "era": round(fv(p,"ERA"),3),
            "whip": round(fv(p,"WHIP"),3), "hra": round(fv(p,"HR"),1),
            "mgs": round(calc_mgs_per_gs(p), 2), "fip": round(fv(p,"FIP"),3),
            "war": round(fv(p,"WAR"),2),
            "ldb_score": round(p["LDB_Score"],3),
            "rfa_team": get_rfa_team(p["Name"], rfa_norm),
            "positions": get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team","")),
            "is_fry_keeper": p["Name"] in FRY_KEEPERS,
        })
    return results

# ── RP RANKINGS ────────────────────────────────────────────────────────────────
def build_rp(proj_path, unavail, rfa_norm, pos_map, pos_by_name_team, budget, system_name):
    with open(proj_path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    eligible = [r for r in rows if fv(r,"IP") >= MIN_IP and not is_unavailable(r["Name"], unavail)]
    for r in eligible:
        r["_raw_VIJAY"] = calc_vijay_season(r)
        r["_raw_K"]     = fv(r,"SO")
        r["_raw_ERA"]   = fv(r,"ERA")
        r["_raw_HRA"]   = fv(r,"HR")
        r["_raw_aWHIP"] = fv(r,"WHIP")
    cat_weights = {"VIJAY":(True,3.0),"K":(True,1.5),"ERA":(False,1.0),
                   "HRA":(False,1.0),"aWHIP":(False,1.0)}
    eligible = compute_values(eligible, cat_weights, budget)
    results = []
    for i, p in enumerate(eligible):
        tier = 1 if i<8 else 2 if i<20 else 3 if i<50 else 4 if i<100 else 5
        results.append({
            "id": f"{system_name}_rp_{i}",
            "system": system_name,
            "rank": i+1, "tier": tier,
            "est_value": p["Est_Value"],
            "name": p["Name"], "team": p.get("Team",""),
            "g": round(fv(p,"G"),1), "ip": round(fv(p,"IP"),1),
            "sv": round(fv(p,"SV"),1), "hld": round(fv(p,"HLD"),1),
            "bs": round(fv(p,"BS"),1), "k": round(fv(p,"SO"),1),
            "era": round(fv(p,"ERA"),3), "whip": round(fv(p,"WHIP"),3),
            "hra": round(fv(p,"HR"),1), "vijay": round(calc_vijay_per_g(p), 3),
            "war": round(fv(p,"WAR"),2),
            "ldb_score": round(p["LDB_Score"],3),
            "rfa_team": get_rfa_team(p["Name"], rfa_norm),
            "positions": get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team","")),
            "is_fry_keeper": p["Name"] in FRY_KEEPERS,
        })
    return results

# ── MERGE: pair ATC/BATX + OOPSY by name ──────────────────────────────────────
def merge_rankings(primary_list, secondary_list):
    """Merge secondary data into primary list by player name matching.
    Returns combined list with both systems' data on each player object."""
    sec_by_norm = {}
    for p in secondary_list:
        sec_by_norm[norm(p["name"])] = p
        # Also index by fuzzy for fallback
    
    merged = []
    for p in primary_list:
        n = norm(p["name"])
        sec = sec_by_norm.get(n)
        if not sec:
            for sn, sv in sec_by_norm.items():
                if SequenceMatcher(None, n, sn).ratio() > 0.88:
                    sec = sv
                    break
        entry = dict(p)
        entry["system"] = "batx" if p.get("pa") is not None else ("atc_sp" if p.get("gs") is not None else "atc_rp")
        if sec:
            entry["oopsy_rank"] = sec["rank"]
            entry["oopsy_tier"] = sec["tier"]
            entry["oopsy_est_value"] = sec["est_value"]
            entry["oopsy_ldb_score"] = sec["ldb_score"]
            # Position-specific secondary stats
            for key in ["hr","r","obp","ops","rbi","sb","asb","wrc_plus","war",
                        "gs","ip","k","era","whip","hra","mgs","fip",
                        "g","sv","hld","bs","vijay"]:
                if key in sec:
                    entry[f"oopsy_{key}"] = sec[key]
        else:
            entry["oopsy_rank"] = None
            entry["oopsy_tier"] = None
            entry["oopsy_est_value"] = None
            entry["oopsy_ldb_score"] = None
        merged.append(entry)
    return merged

# ── MAIN ───────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("LDB 2026 Data Generation")
    print("=" * 60)

    print("\n[1/6] Parsing draft board...")
    board = parse_draft_board(DRAFT_BOARD)
    unavail = board["all_unavailable"]
    teams   = board["teams"]
    total_budget = board["total_budget"]
    print(f"  Teams: {len(teams)}  |  Total pool: ${total_budget:.2f}M")
    print(f"  Owned: {len(board['owned'])}  |  AA: {len(board['aa_names'])}")

    print("\n[2/6] Parsing RFA rights...")
    rfa_norm = parse_rfa(RFA_FILE)
    fry_rfa = [p for p, t in rfa_norm.items() if t == FRY_TEAM]
    print(f"  RFA entries: {len(rfa_norm)}  |  FRY ROFR: {fry_rfa}")

    print("\n[3/6] Parsing CBS positional eligibility...")
    pos_map, pos_by_name_team = parse_positions_cbs(CBS_BAT_ELIG, CBS_SP_ELIG, CBS_RP_ELIG)
    print(f"  Players with eligibility: {len(pos_map)}")

    hit_budget = total_budget * HIT_SPLIT
    sp_budget  = total_budget * SP_SPLIT
    rp_budget  = total_budget * RP_SPLIT
    print(f"\n[4/6] Budget splits: Hit=${hit_budget:.0f}M  SP=${sp_budget:.0f}M  RP=${rp_budget:.0f}M")

    print("\n[5/6] Building rankings (ATC/BATX + OOPSY)...")
    batx_batters  = build_batters(BATX_BATTERS,  unavail, rfa_norm, pos_map, pos_by_name_team, hit_budget, "batx")
    oopsy_batters = build_batters(OOPSY_BATTERS, unavail, rfa_norm, pos_map, pos_by_name_team, hit_budget, "oopsy")
    print(f"  Batters: {len(batx_batters)} BATX / {len(oopsy_batters)} OOPSY")

    atc_sp   = build_sp(ATC_SP,   unavail, rfa_norm, pos_map, pos_by_name_team, sp_budget, "atc")
    oopsy_sp = build_sp(OOPSY_SP, unavail, rfa_norm, pos_map, pos_by_name_team, sp_budget, "oopsy")
    print(f"  SP:      {len(atc_sp)} ATC / {len(oopsy_sp)} OOPSY")

    atc_rp   = build_rp(ATC_RP,   unavail, rfa_norm, pos_map, pos_by_name_team, rp_budget, "atc")
    oopsy_rp = build_rp(OOPSY_RP, unavail, rfa_norm, pos_map, pos_by_name_team, rp_budget, "oopsy")
    print(f"  RP:      {len(atc_rp)} ATC / {len(oopsy_rp)} OOPSY")

    print("\n[6/6] Merging + writing ldb_data.js...")
    batters = merge_rankings(batx_batters, oopsy_batters)
    sp      = merge_rankings(atc_sp,       oopsy_sp)
    rp      = merge_rankings(atc_rp,       oopsy_rp)

    # Build owned roster per team (for league board)
    roster_by_team = {abbr: [] for abbr in teams}
    for name, info in board["owned"].items():
        t = info["team"]
        if t in roster_by_team:
            roster_by_team[t].append({
                "name": name, "salary": info["salary"],
                "contract": info["contract"], "pos": info["pos"]
            })

    data = {
        "generated_at": "2026-03-09",
        "meta": {
            "total_budget": round(total_budget, 2),
            "hit_budget":   round(hit_budget, 2),
            "sp_budget":    round(sp_budget, 2),
            "rp_budget":    round(rp_budget, 2),
            "min_pa": MIN_PA, "min_gs": MIN_GS, "min_ip": MIN_IP,
        },
        "teams": teams,
        "roster_by_team": roster_by_team,
        "rfa": {p: t for p, t in rfa_norm.items()},
        "aa_names": board["aa_names"],
        "batters": batters,
        "sp": sp,
        "rp": rp,
        "fry_keepers": FRY_KEEPERS,
    }

    OUTPUT_JS.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write("// AUTO-GENERATED by generate_data.py — do not edit manually\n")
        f.write(f"// Generated: {data['generated_at']}\n\n")
        f.write("export const LDB_DATA = ")
        f.write(json.dumps(data, indent=2, ensure_ascii=False))
        f.write(";\n")

    print(f"  ✓ Written to {OUTPUT_JS}")
    print(f"\n── TOP 5 BATTERS (BATX) ──")
    for p in batters[:5]:
        oopsy = f"OOPSY #{p.get('oopsy_rank','—')}" if p.get('oopsy_rank') else "no OOPSY match"
        print(f"  #{p['rank']:<3} {p['name']:<25} ${p['est_value']}M  {oopsy}")
    print(f"\n── TOP 5 SP (ATC) ──")
    for p in sp[:5]:
        oopsy = f"OOPSY #{p.get('oopsy_rank','—')}" if p.get('oopsy_rank') else "no OOPSY match"
        print(f"  #{p['rank']:<3} {p['name']:<25} ${p['est_value']}M  {oopsy}")
    print(f"\n── TOP 5 RP (ATC) ──")
    for p in rp[:5]:
        oopsy = f"OOPSY #{p.get('oopsy_rank','—')}" if p.get('oopsy_rank') else "no OOPSY match"
        print(f"  #{p['rank']:<3} {p['name']:<25} ${p['est_value']}M  {oopsy}")
    print("\nDone!")

if __name__ == "__main__":
    main()
