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

import csv, json, statistics, re, os, math
from pathlib import Path
from datetime import date
from difflib import SequenceMatcher

# ── PATHS ──────────────────────────────────────────────────────────────────────
_HERE      = Path(__file__).parent
INPUT_DIR  = _HERE / "data"
OUTPUT_JS  = _HERE / "src" / "data" / "ldb_data.js"
OUTPUT_PREVIEW_MD = _HERE / "LDB_2026_Auction_Preview.md"

DRAFT_BOARD   = INPUT_DIR / "2026_LDB_Draft_Board__2026_Board.csv"
RFA_FILE      = INPUT_DIR / "2026_LDB_Draft_Board__RFA_Rights.csv"
BATX_BATTERS  = INPUT_DIR / "2026_BATX_Batters_Projections.csv"
OOPSY_BATTERS = INPUT_DIR / "2026_OOPSY_Batters_Projections.csv"
ATC_BATTERS   = INPUT_DIR / "2026_ATC_Batter_Rankings.csv"
ATC_SP        = INPUT_DIR / "2026_ATC_SP_Projections.csv"
OOPSY_SP      = INPUT_DIR / "2026_OOPSY_SP_Projections.csv"
ATC_RP        = INPUT_DIR / "2026_ATC_RP_Projections.csv"
OOPSY_RP      = INPUT_DIR / "2026_OOPSY_RP_Projections.csv"
CBS_BAT_ELIG  = INPUT_DIR / "CBS_batter_elig.csv"
CBS_SP_ELIG   = INPUT_DIR / "CBS_SP_elig.csv"
CBS_RP_ELIG   = INPUT_DIR / "CBS_RP_elig.csv"
PLAYER_NOTES  = INPUT_DIR / "player_notes.json"
PL_BATTERS    = INPUT_DIR / "2026_PL_Batter_Rankings.csv"
PL_SP         = INPUT_DIR / "2026_PL_SP_Rankings.csv"
PL_RP         = INPUT_DIR / "PL_RP_SVHLD_rankings.csv"
ATHLETIC_SP   = INPUT_DIR / "2026_Athletic_SP_Rankings.csv"
TAG_POLICY_FILE = INPUT_DIR / "tag_policy.json"

# ── CONSTANTS ──────────────────────────────────────────────────────────────────
MIN_PA  = 200
MIN_GS  = 10
MIN_IP  = 20
HIT_SPLIT = 0.50
SP_SPLIT  = 0.30
RP_SPLIT  = 0.20
RP_VALUE_SCALE    = 0.80   # Scale RP values down (fewer innings than SPs)
FULL_TEAM_BUDGET  = 200.0  # Fixed baseline per-team budget for theoretical values
SEASON_WEEKS = 26
TEAM_WEEKLY_AB = 200.0
TEAM_WEEKLY_IP = 50.0

FRY_TEAM = "FRY"
FRY_KEEPERS = ["Ronald Acuña Jr.", "Brent Rooker",
               "Riley Greene", "Corbin Carroll", "Cal Raleigh",
               "Drew Rasmussen", "Matthew Liberatore", "Andrés Muñoz"]

RFA_TEAM_MAP = {
    "aids":"AIDS","fish fry":"FRY","balks":"BALK","choice":"CHOICE",
    "cornballers":"CORN","pollos":"POLL","nate":"NATE","neo":"NEO",
    "roof":"ROOF","tones":"TONES","wind":"WIND","ichi":"ICHI",
    "work":"WORK","izzy":"IZZY","ipa":"IPA","pwrs":"PWRS",
    "balk":"BALK","fry":"FRY","pollos hermanos":"POLL",
}

# Position eligibility slots per team (used for scarcity)
POS_SLOTS_PER_TEAM = {"C":1,"1B":1,"2B":1,"3B":1,"SS":1,"OF":3,"CF":1,"RF":1,"UT":1,"SP":6,"RP":3}

# ── REPLACEMENT LEVEL CONFIG ───────────────────────────────────────────────────
# Simplified position buckets used for replacement level simulation.
# OF=5 covers all outfield slots (3 pure OF + CF + RF).
REPL_BAT_SLOTS = {"C":1,"1B":1,"2B":1,"3B":1,"SS":1,"OF":5,"UT":1}
REPL_SP_SLOTS_PER_TEAM = 8   # average SPs carried per team (less strict SP replacement baseline)
REPL_RP_SLOTS_PER_TEAM = 5   # RP starters per team (stricter replacement baseline)
REPL_BENCH_PCT = 0.20         # additional 20% bench depth beyond starter slots
REPL_BAT_BENCH_PCT = 0.30     # deeper batter replacement pool -> lower batter threshold
REPL_TOP_N     = 5            # average top-N remaining players = replacement level

# Shared category weights used by scoring cache.
CAT_BAT = {"OPS":(True,2.8),"OBP":(True,2.5),"HR":(True,1.9),
           "aSB":(True,1.4),"R":(True,1.4),"aRBI":(True,1.4)}
CAT_SP  = {"MGS":(True,2.5),"K":(True,2.2),"ERA":(False,1.9),
           "HRA":(False,1.3),"aWHIP":(False,1.6)}
CAT_RP  = {"VIJAY":(True,2.0),"K":(True,1.6),"ERA":(False,1.0),
           "HRA":(False,0.9),"aWHIP":(False,1.2)}

# ── DEBUG FLAGS ────────────────────────────────────────────────────────────────
# Set LDB_DEBUG_AMBIG_POS=1 to print ambiguous abbreviated position lookups.
DEBUG_AMBIG_POS = os.getenv("LDB_DEBUG_AMBIG_POS", "").strip() in {"1", "true", "TRUE", "yes", "YES"}
_AMBIG_POS_SEEN = set()

# ── RUNTIME CACHES ─────────────────────────────────────────────────────────────
_CSV_ROWS_CACHE = {}
_SCORED_POOL_CACHE = {}


def load_tag_policy(path: Path):
    """Load central tag policy (allowed + blocked tags)."""
    default_allowed = {
        "ELITE", "POWER_OBP", "HR_THREAT", "SB_THREAT", "OBP_ONLY",
        "WORKHORSE", "K_MACHINE", "RATIOS_ACE", "GB_PITCHER", "MGS_ELITE",
        "INNINGS_EAT", "CLOSER", "HOLDS_VALUE", "SAVES_SAFE", "CLOSER_RISK",
        "ELITE_ERA", "VIJAY_ELITE", "SLEEPER", "BREAKOUT", "BOUNCE_BACK",
        "BUST", "INJURED", "IL", "IL_START", "DTD", "DELAYED", "INJURY_RISK",
        "ROLE_UNCLEAR", "STASH", "PROSPECT", "DEEP_LEAGUE", "ROFR_TARGET",
        "LDB_NEED", "SP_LOCKED", "RP_SP_ELIG", "PL_RP_SP_ELIG", "PLATOON", "HANDCUFF", "AGING", "STREAKY",
        "SPEED_VALUE", "MULTI_POS",
        # ATC volatility-derived tags
        "HIGH_FLOOR", "VOLATILE", "UPSIDE_PLAY", "BUST_RISK",
    }
    default_blocked = {"ADP_AVOID", "ADP_VALUE"}
    policy = {
        "allowed_tags": set(default_allowed),
        "blocked_tags": set(default_blocked),
    }
    if not path.exists():
        return policy
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw.get("allowed_tags"), list):
            policy["allowed_tags"] = {str(t).strip() for t in raw["allowed_tags"] if str(t).strip()}
        if isinstance(raw.get("blocked_tags"), list):
            policy["blocked_tags"] = {str(t).strip() for t in raw["blocked_tags"] if str(t).strip()}
    except Exception as e:
        print(f"  [tag-policy] Failed to parse {path.name}: {e}. Using defaults.")
    return policy


TAG_POLICY = load_tag_policy(TAG_POLICY_FILE)
ALLOWED_TAGS = TAG_POLICY["allowed_tags"]
BLOCKED_TAGS = TAG_POLICY["blocked_tags"]


def is_tag_allowed(tag: str) -> bool:
    return tag not in BLOCKED_TAGS and (not ALLOWED_TAGS or tag in ALLOWED_TAGS)


def policy_filter_tags(tags):
    return {t for t in tags if is_tag_allowed(t)}

# ── HELPERS ────────────────────────────────────────────────────────────────────
def norm(name):
    """Normalize name for matching: lowercase, strip accents, remove suffixes, collapse whitespace."""
    if not name or not isinstance(name, str):
        return ""
    s = name.lower().strip()
    s = s.replace("á","a").replace("é","e").replace("í","i").replace("ó","o")
    s = s.replace("ú","u").replace("ü","u").replace("ñ","n").replace("ö","o")
    # Insert space after period glued to a letter BEFORE stripping periods
    # Handles "J.Wood" → "J. Wood", "J.H. Lee" → "J. H. Lee"
    s = re.sub(r"\.([a-z])", r" \1", s)
    s = s.replace(".","").replace("-"," ").replace("'","").replace("`","")
    # Remove common suffixes (order matters: longer first)
    for suf in (" jr", " sr", " iii", " iv", " ii"):
        if s.endswith(suf):
            s = s[: -len(suf)]
    s = re.sub(r"\s+", " ", s).strip()
    return s

def strip_team_suffix(name):
    """Remove trailing parenthetical team code e.g. ' (MIL)' or '(NYY)' from draft board names."""
    if not name or not isinstance(name, str):
        return name
    return re.sub(r"\s*\([A-Za-z0-9]+\)\s*$", "", name).strip()


def is_abbrev_name(name):
    """Heuristic: abbreviated names usually look like 'J. Smith' or single-letter first token."""
    if "." in name:
        return True
    parts = norm(name).split()
    return bool(parts) and len(parts[0]) == 1

def abbrev_match(name_a, name_b):
    """
    Check if two names refer to the same player, handling:
    - Abbreviated first names (J. Rodriguez <-> Julio Rodriguez)
    - Works bidirectionally (either name may be abbreviated)
    """
    s, f = norm(name_a).split(), norm(name_b).split()
    if len(s) < 2 or len(f) < 2:
        return False
    if s[-1] != f[-1]:  # last name must match
        return False
    # First name: either one is abbreviation of the other
    a0, b0 = s[0].replace(".", ""), f[0].replace(".", "")
    if not a0 or not b0:
        return False
    return a0.startswith(b0) or b0.startswith(a0)

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


def calc_ab_per_week(row):
    # Use PA as best available proxy for weekly AB share.
    return fv(row, "PA") / SEASON_WEEKS if SEASON_WEEKS > 0 else 0.0


def calc_ip_per_week(row):
    return fv(row, "IP") / SEASON_WEEKS if SEASON_WEEKS > 0 else 0.0


def ratio_weekly_delta(player_ratio, player_weekly_volume, team_ratio, team_weekly_volume):
    """Weekly ratio movement if player contributes into a team-level denominator bucket."""
    denom = team_weekly_volume + player_weekly_volume
    if denom <= 0:
        return 0.0
    blended = ((team_ratio * team_weekly_volume) + (player_ratio * player_weekly_volume)) / denom
    return blended - team_ratio


def get_matching_sp_path_for_rp(rp_proj_path: Path):
    """Map RP projection file to its paired SP projection file for workload context."""
    name = rp_proj_path.name.lower()
    if "oopsy" in name:
        return OOPSY_SP
    return ATC_SP


def get_sp_reference_ip_per_week(sp_proj_path: Path):
    """Average SP weekly innings among qualified SPs, used for RP context scaling."""
    rows = get_csv_rows_cached(sp_proj_path)
    sp_pool = [r for r in rows if fv(r, "GS") >= MIN_GS]
    if not sp_pool:
        return 0.0
    return statistics.mean(calc_ip_per_week(r) for r in sp_pool)

def names_match(proj_name, draft_name):
    """
    Core matching logic: projection CSV name vs draft board name.
    Handles abbreviations, accents, suffixes, team codes in draft names.
    """
    draft_clean = strip_team_suffix(draft_name)
    n = norm(proj_name)
    t = norm(draft_clean)
    if n == t:
        return True
    if abbrev_match(proj_name, draft_clean):
        return True
    if SequenceMatcher(None, n, t).ratio() >= 0.87:
        return True
    return False

def build_unavail_index(unavail_set):
    """Pre-compute fast lookup structures from the unavailable set so that
    is_unavailable() runs in O(1)/O(k) instead of O(n * SequenceMatcher).

    Returns (norm_exact, last_name_idx):
      norm_exact    — set of pre-normalised names for exact hits
      last_name_idx — last_name → [(orig_name, norm_name)] for abbrev lookups
    """
    norm_exact    = set()
    last_name_idx = {}
    for taken in unavail_set:
        clean = strip_team_suffix(taken)
        n = norm(clean)
        norm_exact.add(n)
        parts = n.split()
        if parts:
            last_name_idx.setdefault(parts[-1], []).append((clean, n))
    return norm_exact, last_name_idx

def is_unavailable(proj_name, unavail_idx):
    """Fast unavailability check using pre-built index.
    unavail_idx is the tuple returned by build_unavail_index().
    Falls back to SequenceMatcher only within same-last-name candidates.
    """
    norm_exact, last_name_idx = unavail_idx
    n = norm(proj_name)
    # 1. O(1) exact norm match
    if n in norm_exact:
        return True
    # 2. O(k) abbreviated-first-name match — only candidates with same last name
    parts = n.split()
    if parts:
        same_last = last_name_idx.get(parts[-1], [])
        for orig, tn in same_last:
            tp = tn.split()
            if tp and (parts[0].startswith(tp[0]) or tp[0].startswith(parts[0])):
                return True
        # 3. Rare fallback: fuzzy ratio within same-last-name bucket only
        # (avoids expensive O(n) scans over all unavailable names).
        for orig, tn in same_last:
            if SequenceMatcher(None, n, tn).ratio() >= 0.87:
                return True
    return False

class NameMatcher:
    """Reusable exact/abbrev/fuzzy matcher over a normalized-name keyed map."""
    def __init__(self, by_norm, fuzzy_threshold=0.88):
        self.by_norm = by_norm
        self.fuzzy_threshold = fuzzy_threshold
        self.by_last = {}
        for n, v in by_norm.items():
            parts = n.split()
            if parts:
                self.by_last.setdefault(parts[-1], []).append((n, v))

    def get(self, query_name):
        n = norm(query_name)
        hit = self.by_norm.get(n)
        if hit is not None:
            return hit
        parts = n.split()
        if parts:
            bucket = self.by_last.get(parts[-1], [])
            for cand_name, val in bucket:
                if abbrev_match(query_name, cand_name):
                    return val
            for cand_name, val in bucket:
                if SequenceMatcher(None, n, cand_name).ratio() > self.fuzzy_threshold:
                    return val
        # Rare fallback for names lacking a usable last-name token.
        for cand_name, val in self.by_norm.items():
            if SequenceMatcher(None, n, cand_name).ratio() > self.fuzzy_threshold:
                return val
        return None


def get_rfa_team(proj_name, rfa_norm, rfa_matcher=None):
    if rfa_matcher:
        return rfa_matcher.get(proj_name) or ""
    n = norm(proj_name)
    if n in rfa_norm:
        return rfa_norm[n]
    for rn, t in rfa_norm.items():
        if SequenceMatcher(None, n, rn).ratio() > 0.85:
            return t
    return ""

def compute_ldb_scores(players, cat_weights):
    """Compute z-scores and LDB_Score for a list of players. Sorts by LDB_Score descending.
    Expects _raw_* keys to already be set on each player dict."""
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
    return players

def assign_est_values(players, budget):
    """Assign Est_Value to each player proportionally from budget by LDB_Score.
    Players must already have LDB_Score set. Modifies in place, returns players."""
    pos_total = sum(p["LDB_Score"] for p in players if p["LDB_Score"] > 0)
    for p in players:
        if p["LDB_Score"] > 0 and pos_total > 0:
            raw = (p["LDB_Score"] / pos_total) * budget
            p["Est_Value"] = max(0.5, round(raw * 2) / 2)
        else:
            p["Est_Value"] = 0.5
    return players

def compute_values(players, cat_weights, budget):
    """Convenience: compute z-scores + assign Est_Value in one call."""
    players = compute_ldb_scores(players, cat_weights)
    players = assign_est_values(players, budget)
    return players


def get_csv_rows_cached(path):
    """Read projection CSV rows once; return fresh row dict copies."""
    key = str(path)
    if key not in _CSV_ROWS_CACHE:
        with open(path, encoding="utf-8-sig") as f:
            _CSV_ROWS_CACHE[key] = list(csv.DictReader(f))
    # Return copies so callers can mutate safely.
    return [dict(r) for r in _CSV_ROWS_CACHE[key]]


def get_scored_pool_cached(pool_kind, proj_path):
    """Return a fresh copy of pre-scored projection pool for bat/sp/rp."""
    key = (pool_kind, str(proj_path))
    if key not in _SCORED_POOL_CACHE:
        rows = get_csv_rows_cached(proj_path)
        if pool_kind == "bat":
            pool = [r for r in rows if fv(r, "PA") >= MIN_PA]
            team_obp = statistics.mean(fv(r, "OBP") for r in pool) if pool else 0.0
            team_ops = statistics.mean(fv(r, "OPS") for r in pool) if pool else 0.0
            for r in pool:
                ab_wk = calc_ab_per_week(r)
                r["_raw_aSB"]  = calc_aSB(r)
                r["_raw_HR"]   = fv(r, "HR")
                r["_raw_R"]    = fv(r, "R")
                # Ratio categories are scored by weekly team-impact, not raw ratio level.
                r["_ab_per_week"] = ab_wk
                r["_raw_OBP"] = ratio_weekly_delta(fv(r, "OBP"), ab_wk, team_obp, TEAM_WEEKLY_AB)
                r["_raw_OPS"] = ratio_weekly_delta(fv(r, "OPS"), ab_wk, team_ops, TEAM_WEEKLY_AB)
                r["_raw_aRBI"] = fv(r, "RBI")
            pool = compute_ldb_scores(pool, CAT_BAT)
        elif pool_kind == "sp":
            pool = [r for r in rows if fv(r, "GS") >= MIN_GS]
            team_era = statistics.mean(fv(r, "ERA") for r in pool) if pool else 0.0
            team_whip = statistics.mean(fv(r, "WHIP") for r in pool) if pool else 0.0
            for r in pool:
                ip_wk = calc_ip_per_week(r)
                r["_raw_MGS"]   = calc_mgs_season(r)
                r["_raw_K"]     = fv(r, "SO")
                r["_ip_per_week"] = ip_wk
                r["_raw_ERA"] = ratio_weekly_delta(fv(r, "ERA"), ip_wk, team_era, TEAM_WEEKLY_IP)
                r["_raw_HRA"]   = fv(r, "HR")
                r["_raw_aWHIP"] = ratio_weekly_delta(fv(r, "WHIP"), ip_wk, team_whip, TEAM_WEEKLY_IP)
            pool = compute_ldb_scores(pool, CAT_SP)
        elif pool_kind == "rp":
            pool = [r for r in rows if fv(r, "IP") >= MIN_IP]
            team_era = statistics.mean(fv(r, "ERA") for r in pool) if pool else 0.0
            team_whip = statistics.mean(fv(r, "WHIP") for r in pool) if pool else 0.0
            sp_ref_ip_week = get_sp_reference_ip_per_week(get_matching_sp_path_for_rp(proj_path))
            for r in pool:
                ip_wk = calc_ip_per_week(r)
                # Context-aware RP contribution scale relative to SP workload.
                # Typical RP volume should contribute proportionally less than SP volume.
                ip_ctx = (ip_wk / sp_ref_ip_week) if sp_ref_ip_week > 0 else 0.0
                ip_ctx = max(0.0, min(1.0, ip_ctx))
                r["_raw_VIJAY"] = calc_vijay_season(r) * ip_ctx
                r["_raw_K"]     = fv(r, "SO") * ip_ctx
                r["_ip_per_week"] = ip_wk
                r["_raw_ERA"] = ratio_weekly_delta(fv(r, "ERA"), ip_wk, team_era, TEAM_WEEKLY_IP)
                r["_raw_HRA"]   = fv(r, "HR") * ip_ctx
                r["_raw_aWHIP"] = ratio_weekly_delta(fv(r, "WHIP"), ip_wk, team_whip, TEAM_WEEKLY_IP)
                r["_rp_ip_context"] = ip_ctx
            pool = compute_ldb_scores(pool, CAT_RP)
        else:
            raise ValueError(f"Unknown pool_kind: {pool_kind}")
        _SCORED_POOL_CACHE[key] = pool

    # Return copies so downstream valuation mutation doesn't contaminate cache.
    return [dict(r) for r in _SCORED_POOL_CACHE[key]]

# ── REPLACEMENT LEVEL ENGINE ───────────────────────────────────────────────────

def normalize_pos_for_repl(positions):
    """Map CBS position tokens to simplified REPL_BAT_SLOTS bucket keys."""
    result = set()
    for p in positions:
        if p == "C":               result.add("C")
        elif p == "1B":            result.add("1B")
        elif p == "DH":            result.add("1B")   # DH counts as 1B utility
        elif p == "2B":            result.add("2B")
        elif p == "3B":            result.add("3B")
        elif p == "SS":            result.add("SS")
        elif p in {"OF","CF","RF","LF"}: result.add("OF")
        elif p == "INF":           result.update({"2B","3B","SS"})
        elif p == "U":             result.add("UT")
    return result


def compute_batter_replacement_levels(
        proj_path, owned, aa_names, pos_map, pos_by_name_team, pos_by_last,
        num_teams, bench_pct=REPL_BAT_BENCH_PCT, top_n=REPL_TOP_N):
    """
    Compute replacement-level LDB_Score for each batting position from the
    *available* pool (excluding owned + AA), while anchoring the replacement
    window to league-wide slot baselines.

    For each position:
      - Determine league starter slots (slots/team * num_teams)
      - Add bench depth (bench_pct)
      - In the available eligible list, replacement level = avg LDB_Score of
        players in [cutoff : cutoff + top_n)

    Example for C in 16-team league (1 C/team, bench_pct=0.30, top_n=5):
      cutoff = 16 + floor(16 * 0.30) = 20
      replacement ≈ available catcher ranks 21-25 by LDB_Score.
    """
    all_qual = get_scored_pool_cached("bat", proj_path)

    # Pre-cache normalized positions for every player.
    pos_cache = {}
    for p in all_qual:
        raw_pos = get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team",""), pos_by_last)
        pos_cache[norm(p["Name"])] = normalize_pos_for_repl(raw_pos)

    unavailable_norms = {norm(n) for n in owned.keys()} | {norm(n) for n in aa_names}
    available = [p for p in all_qual if norm(p["Name"]) not in unavailable_norms]

    total_slots = {pos: s * num_teams for pos, s in REPL_BAT_SLOTS.items()}
    replacement_levels = {}
    for pos in ["C", "1B", "2B", "3B", "SS", "OF", "UT"]:
        slots = total_slots.get(pos, 0)
        cutoff = slots + int(slots * bench_pct)
        # Utility is an "any bat" slot, not only explicit U-eligible players.
        if pos == "UT":
            eligible = list(available)
        else:
            eligible = [p for p in available if pos in pos_cache.get(norm(p["Name"]), set())]
        window = eligible[cutoff: cutoff + top_n]
        if window:
            replacement_levels[pos] = statistics.mean(p["LDB_Score"] for p in window)
        elif eligible:
            replacement_levels[pos] = eligible[-1]["LDB_Score"]
        else:
            replacement_levels[pos] = 0.0

    return replacement_levels


def compute_pitcher_replacement_levels(
        sp_proj_path, rp_proj_path, owned, aa_names, num_teams,
        sp_slots=REPL_SP_SLOTS_PER_TEAM, rp_slots=REPL_RP_SLOTS_PER_TEAM,
        bench_pct=REPL_BENCH_PCT, top_n=REPL_TOP_N):
    """
    Compute replacement-level LDB_Score for SP and RP independently.
    SP slots are filled first (higher priority); RP from a separate pool.
    Returns {"SP": float, "RP": float}
    """
    owned_norms = {norm(n) for n in owned.keys()}
    aa_norms    = {norm(n) for n in aa_names}
    all_unavail = owned_norms | aa_norms

    # ── SP ──────────────────────────────────────────────────────────────────
    all_sp = get_scored_pool_cached("sp", sp_proj_path)

    sp_norms = {norm(p["Name"]) for p in all_sp}
    total_sp = sp_slots * num_teams
    owned_sp = 0
    for owned_name, info in owned.items():
        n = norm(owned_name)
        if n in aa_norms:
            continue
        # Use draft-board slot label first; fallback to projection membership so
        # owned players below MIN_GS still count if they are SPs.
        pos_label = str(info.get("pos", "")).upper()
        if "SP" in pos_label or n in sp_norms:
            owned_sp += 1
    remain_sp  = max(0, total_sp - owned_sp)
    bench_sp   = int(remain_sp * bench_pct)

    avail_sp   = [p for p in all_sp if norm(p["Name"]) not in all_unavail]
    fill_sp    = min(remain_sp + bench_sp, len(avail_sp))
    repl_sp_p  = avail_sp[fill_sp : fill_sp + top_n]
    sp_repl    = (statistics.mean(p["LDB_Score"] for p in repl_sp_p)
                  if repl_sp_p else (avail_sp[-1]["LDB_Score"] if avail_sp else 0.0))

    # ── RP ──────────────────────────────────────────────────────────────────
    all_rp = get_scored_pool_cached("rp", rp_proj_path)

    rp_norms = {norm(p["Name"]) for p in all_rp}
    total_rp = rp_slots * num_teams
    owned_rp = 0
    for owned_name, info in owned.items():
        n = norm(owned_name)
        if n in aa_norms:
            continue
        # Use draft-board slot label first; fallback to projection membership so
        # owned players below MIN_IP still count if they are RPs.
        pos_label = str(info.get("pos", "")).upper()
        if "RP" in pos_label or n in rp_norms:
            owned_rp += 1
    remain_rp  = max(0, total_rp - owned_rp)
    bench_rp   = int(remain_rp * bench_pct)

    avail_rp   = [p for p in all_rp if norm(p["Name"]) not in all_unavail]
    fill_rp    = min(remain_rp + bench_rp, len(avail_rp))
    repl_rp_p  = avail_rp[fill_rp : fill_rp + top_n]
    rp_repl    = (statistics.mean(p["LDB_Score"] for p in repl_rp_p)
                  if repl_rp_p else (avail_rp[-1]["LDB_Score"] if avail_rp else 0.0))

    return {"SP": sp_repl, "RP": rp_repl}


def assign_est_values_vorp(players, budget, replacement_levels,
                           pos_map, pos_by_name_team, pos_by_last):
    """
    Assign Est_Value proportional to value above replacement (VORP).
    Each player's replacement level = lowest threshold among their eligible positions
    (= the position where they contribute the most value above a weak baseline).
    Players at or below replacement get the $0.5M floor.
    """
    for p in players:
        raw_pos   = get_positions(p["Name"], pos_map, pos_by_name_team,
                                  p.get("Team",""), pos_by_last)
        norm_pos  = normalize_pos_for_repl(raw_pos)
        valid_rl  = [replacement_levels[pos] for pos in norm_pos if pos in replacement_levels]
        best_repl = min(valid_rl) if valid_rl else 0.0   # position with worst baseline = most valuable
        p["_repl_level"] = best_repl
        p["_vorp"]       = max(0.0, p["LDB_Score"] - best_repl)

    total_vorp = sum(p["_vorp"] for p in players)
    for p in players:
        if total_vorp > 0 and p["_vorp"] > 0:
            raw = (p["_vorp"] / total_vorp) * budget
            p["Est_Value"] = max(0.5, round(raw * 2) / 2)
        else:
            p["Est_Value"] = 0.5
    return players


def assign_est_values_vorp_pitcher(players, budget, replacement_level_score):
    """VORP-based value allocation for a single pitcher pool (SP or RP)."""
    for p in players:
        p["_repl_level"] = replacement_level_score
        p["_vorp"]       = max(0.0, p["LDB_Score"] - replacement_level_score)
    total_vorp = sum(p["_vorp"] for p in players)
    for p in players:
        if total_vorp > 0 and p["_vorp"] > 0:
            raw = (p["_vorp"] / total_vorp) * budget
            p["Est_Value"] = max(0.5, round(raw * 2) / 2)
        else:
            p["Est_Value"] = 0.5
    return players


def lookup_theoretical_value(player_name, tv_map, tv_by_last):
    """Look up theoretical value for a player, handling abbreviated draft-board names.
    Exact norm match first, then abbrev_match via last-name index, then fuzzy fallback.
    Returns the float value, or None if not found.
    """
    n = norm(player_name)
    # 1. Exact norm match
    if n in tv_map:
        return tv_map[n]
    # 2. Abbreviated first-name match via last-name index (O(k))
    #    e.g. "C. Raleigh" → last name "raleigh" → find "cal raleigh"
    parts = n.split()
    if parts and tv_by_last:
        for pn, v in tv_by_last.get(parts[-1], []):
            if abbrev_match(player_name, pn):
                return v
    # 3. Fuzzy ratio fallback (rare — accent/typo edge cases)
    for pn, v in tv_map.items():
        if SequenceMatcher(None, n, pn).ratio() > 0.88:
            return v
    return None


def build_full_pool_values(num_teams, pos_map, pos_by_name_team, pos_by_last):
    """Compute theoretical auction values for ALL qualified players using a fixed
    full-draft baseline of FULL_TEAM_BUDGET × num_teams dollars (no availability
    filter — owned and free players alike, i.e. 'greenfield' pool).

    Values are computed using VORP (Value Over Replacement Player) with replacement
    levels derived from the same scarcity simulation as the main pipeline, but run
    against the full unfiltered pool (no owned/AA exclusions) so that theoretical
    values reflect true scarcity-adjusted auction values for keeper surplus calculation.

    Returns (tv_map, tv_by_last):
      tv_map     — {norm(name): theoretical_value}
      tv_by_last — {last_name: [(norm_name, value), ...]} index for abbrev lookups
    """
    full_total = FULL_TEAM_BUDGET * num_teams
    full_hit   = full_total * HIT_SPLIT
    full_sp    = full_total * SP_SPLIT
    full_rp    = full_total * RP_SPLIT * RP_VALUE_SCALE

    # ── Greenfield replacement levels (empty owned/AA — full pool sim) ────────
    gf_repl_bat = compute_batter_replacement_levels(
        BATX_BATTERS, {}, set(), pos_map, pos_by_name_team, pos_by_last, num_teams)
    gf_repl_pit = compute_pitcher_replacement_levels(
        ATC_SP, ATC_RP, {}, set(), num_teams)
    print(f"  Greenfield replacement levels - bat: "
          + ", ".join(f"{p}:{v:+.2f}" for p, v in sorted(gf_repl_bat.items()))
          + f"  SP:{gf_repl_pit['SP']:+.2f}  RP:{gf_repl_pit['RP']:+.2f}")

    result = {}

    # ── Batters (BATX — primary system) ──────────────────────────────────────
    bat_pool = get_scored_pool_cached("bat", BATX_BATTERS)
    bat_pool = assign_est_values_vorp(bat_pool, full_hit, gf_repl_bat,
                                      pos_map, pos_by_name_team, pos_by_last)
    for p in bat_pool:
        result[norm(p["Name"])] = p["Est_Value"]

    # ── Starting pitchers (ATC — primary system) ──────────────────────────────
    sp_pool = get_scored_pool_cached("sp", ATC_SP)
    sp_pool = assign_est_values_vorp_pitcher(sp_pool, full_sp, gf_repl_pit["SP"])
    for p in sp_pool:
        result[norm(p["Name"])] = p["Est_Value"]

    # ── Relief pitchers (ATC — primary system) ────────────────────────────────
    rp_pool = get_scored_pool_cached("rp", ATC_RP)
    rp_pool = assign_est_values_vorp_pitcher(rp_pool, full_rp, gf_repl_pit["RP"])
    for p in rp_pool:
        result[norm(p["Name"])] = p["Est_Value"]

    # Build last-name index for abbrev lookups (handles "C. Raleigh" → "cal raleigh")
    tv_by_last = {}
    for n, v in result.items():
        parts = n.split()
        if parts:
            tv_by_last.setdefault(parts[-1], []).append((n, v))

    print(f"  Full-pool theoretical values: {len(result)} players "
          f"({len(bat_pool)} bat / {len(sp_pool)} SP / {len(rp_pool)} RP)  "
          f"Budget: ${full_total:.0f}M  (hit ${full_hit:.0f} / SP ${full_sp:.0f} / RP ${full_rp:.0f})")
    return result, tv_by_last

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
    # SN1-6 are promoted minor-league slots — they ARE active rostered players with salaries.
    # Do NOT skip them; treat them as owned just like any other position slot.
    SKIP_LABELS = {""}
    aa_section = False
    owned = {}   # name -> {team, salary, contract, pos}
    aa_names = set()
    aa_by_team = {t["abbr"]: [] for t in teams}

    for row_idx, row in enumerate(rows):
        # Row 0: team headers, Row 1: GM + budget metadata.
        if row_idx < 2:
            continue
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
                aa_by_team[t["abbr"]].append(name)
            elif label not in STOP_LABELS and label != "AA":
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
        "aa_by_team": aa_by_team,
        "all_unavailable": set(owned.keys()) | aa_names,
    }

# ── RFA ────────────────────────────────────────────────────────────────────────
def parse_rfa(path):
    rfa = {}
    rfa_by_team = {}
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            if len(row) >= 2 and row[0].strip():
                player = row[0].strip()
                team_raw = row[1].strip().lower()
                team = RFA_TEAM_MAP.get(team_raw, team_raw.upper())
                rfa[norm(player)] = team
                rfa_by_team.setdefault(team, []).append(player)
    return rfa, rfa_by_team

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
            print(f"  WARNING: {path.name} not found - skipping")
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

    # Build a last-name → [(norm_name, positions)] index for fast abbrev lookups
    pos_by_last = {}
    for norm_name, pos in pos_map.items():
        parts = norm_name.split()
        if parts:
            pos_by_last.setdefault(parts[-1], []).append((norm_name, pos))

    return pos_map, pos_by_name_team, pos_by_last

def get_positions(proj_name, pos_map, pos_by_name_team=None, mlb_team="", pos_by_last=None):
    """Look up positions for a player. Uses (name, team) key first if available to resolve collisions.
    Falls back to abbrev_match (e.g. 'C. Raleigh' → 'Cal Raleigh') for draft-board abbreviated names.
    pos_by_last is a last-name index for O(1) abbrev lookups instead of O(n) full scan.
    norm() handles 'J.Wood' → 'j wood' and 'J.H. Lee' → 'j h lee' edge cases.
    """
    n = norm(proj_name)
    team_key = mlb_team.strip().upper() if mlb_team else ""

    # Memoize frequent repeated lookups during pipeline runs.
    cache = getattr(get_positions, "_cache", None)
    if cache is None:
        cache = {}
        setattr(get_positions, "_cache", cache)
    cache_key = (n, team_key, id(pos_map), id(pos_by_name_team), id(pos_by_last))
    if cache_key in cache:
        return cache[cache_key]

    # Try precise (name, team) lookup first to avoid same-name collisions.
    if pos_by_name_team and mlb_team:
        key = (n, team_key)
        if key in pos_by_name_team:
            cache[cache_key] = pos_by_name_team[key]
            return cache[cache_key]
    if n in pos_map:
        cache[cache_key] = pos_map[n]
        return cache[cache_key]

    # Abbreviated first-name match using last-name index (O(k) not O(n)).
    # e.g. draft board "C. Raleigh" → last name "raleigh" → find "cal raleigh" via abbrev_match
    if pos_by_last:
        parts = n.split()
        if parts:
            same_last = pos_by_last.get(parts[-1], [])
            if DEBUG_AMBIG_POS and is_abbrev_name(proj_name) and len(same_last) > 1:
                dbg_key = (n, team_key, parts[-1])
                if dbg_key not in _AMBIG_POS_SEEN:
                    _AMBIG_POS_SEEN.add(dbg_key)
                    cands = ", ".join(pn for pn, _ in same_last[:8])
                    if len(same_last) > 8:
                        cands += ", ..."
                    print(
                        f"  [debug:ambig-pos] '{proj_name}' team='{team_key or '-'}' "
                        f"last='{parts[-1]}' candidates={len(same_last)} -> [{cands}]"
                    )
            for pn, pos in same_last:
                if abbrev_match(proj_name, pn):
                    cache[cache_key] = pos
                    return cache[cache_key]
            # Fuzzy fallback restricted to same-last-name candidates.
            for pn, pos in same_last:
                if SequenceMatcher(None, n, pn).ratio() > 0.88:
                    cache[cache_key] = pos
                    return cache[cache_key]

    # Final fallback for legacy paths without last-name index.
    for pn, pos in pos_map.items():
        if SequenceMatcher(None, n, pn).ratio() > 0.88:
            cache[cache_key] = pos
            return cache[cache_key]

    cache[cache_key] = []
    return cache[cache_key]

# ── BATTER RANKINGS ────────────────────────────────────────────────────────────
def build_batters(proj_path, unavail, rfa_norm, pos_map, pos_by_name_team, budget, system_name,
                  pos_by_last=None, replacement_levels=None, rfa_matcher=None):
    # ── Global ranking: all players meeting stat minimum ──────────────────────
    all_qualified = get_scored_pool_cached("bat", proj_path)
    global_rank = {norm(p["Name"]): i+1 for i, p in enumerate(all_qualified)}

    # ── Auction pool: filter to available, assign Est_Value ───────────────────
    eligible = [p for p in all_qualified if not is_unavailable(p["Name"], unavail)]
    if replacement_levels:
        eligible = assign_est_values_vorp(eligible, budget, replacement_levels,
                                          pos_map, pos_by_name_team, pos_by_last)
    else:
        eligible = assign_est_values(eligible, budget)

    results = []
    for i, p in enumerate(eligible):
        tier = 1 if i<10 else 2 if i<30 else 3 if i<70 else 4 if i<140 else 5
        results.append({
            "id": f"{system_name}_b_{i}",
            "system": system_name,
            "rank": global_rank.get(norm(p["Name"]), i+1), "tier": tier,
            "est_value": p["Est_Value"],
            "repl_level": round(p.get("_repl_level", 0.0), 3),
            "name": p["Name"], "team": p.get("Team",""),
            "g": round(fv(p,"G"),1), "pa": round(fv(p,"PA"),1),
            "hr": round(fv(p,"HR"),1), "r": round(fv(p,"R"),1),
            "obp": round(fv(p,"OBP"),3), "ops": round(fv(p,"OPS"),3),
            "rbi": round(fv(p,"RBI"),1), "sb": round(fv(p,"SB"),1),
            "asb": round(p["_raw_aSB"],1), "wrc_plus": round(fv(p,"wRC+"),1),
            "war": round(fv(p,"WAR"),2),
            "ab_per_week": round(p.get("_ab_per_week", 0.0), 2),
            "obp_weekly_impact": round(p.get("_raw_OBP", 0.0), 6),
            "ops_weekly_impact": round(p.get("_raw_OPS", 0.0), 6),
            "ldb_score": round(p["LDB_Score"],3),
            "rfa_team": get_rfa_team(p["Name"], rfa_norm, rfa_matcher),
            "positions": get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team",""), pos_by_last),
            "is_fry_keeper": p["Name"] in FRY_KEEPERS,
        })
    return results

# ── SP RANKINGS ────────────────────────────────────────────────────────────────
def build_sp(proj_path, unavail, rfa_norm, pos_map, pos_by_name_team, budget, system_name,
             pos_by_last=None, replacement_level=None, rfa_matcher=None):
    # ── Global ranking: all players meeting stat minimum ──────────────────────
    all_qualified = get_scored_pool_cached("sp", proj_path)
    global_rank = {norm(p["Name"]): i+1 for i, p in enumerate(all_qualified)}

    # ── Auction pool: filter to available, assign Est_Value ───────────────────
    eligible = [p for p in all_qualified if not is_unavailable(p["Name"], unavail)]
    if replacement_level is not None:
        eligible = assign_est_values_vorp_pitcher(eligible, budget, replacement_level)
    else:
        eligible = assign_est_values(eligible, budget)

    results = []
    for i, p in enumerate(eligible):
        tier = 1 if i<8 else 2 if i<20 else 3 if i<50 else 4 if i<100 else 5
        results.append({
            "id": f"{system_name}_sp_{i}",
            "system": system_name,
            "rank": global_rank.get(norm(p["Name"]), i+1), "tier": tier,
            "est_value": p["Est_Value"],
            "repl_level": round(p.get("_repl_level", 0.0), 3),
            "name": p["Name"], "team": p.get("Team",""),
            "gs": round(fv(p,"GS"),1), "ip": round(fv(p,"IP"),1),
            "k": round(fv(p,"SO"),1), "era": round(fv(p,"ERA"),3),
            "whip": round(fv(p,"WHIP"),3), "hra": round(fv(p,"HR"),1),
            "mgs": round(calc_mgs_per_gs(p), 2), "fip": round(fv(p,"FIP"),3),
            "war": round(fv(p,"WAR"),2),
            "ip_per_week": round(p.get("_ip_per_week", 0.0), 2),
            "rp_ip_context": round(p.get("_rp_ip_context", 0.0), 3),
            "era_weekly_impact": round(p.get("_raw_ERA", 0.0), 6),
            "whip_weekly_impact": round(p.get("_raw_aWHIP", 0.0), 6),
            "ldb_score": round(p["LDB_Score"],3),
            "rfa_team": get_rfa_team(p["Name"], rfa_norm, rfa_matcher),
            "positions": get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team",""), pos_by_last),
            "is_fry_keeper": p["Name"] in FRY_KEEPERS,
            # ATC volatility fields (computed by compute_vol_fields after build)
            "vol":      round(fv(p, "Vol"), 3),
            "inter_sd": round(fv(p, "InterSD"), 3),
            "intra_sd": round(fv(p, "IntraSD"), 3),
            "skew":     round(fv(p, "Skew"), 3),
            "dim":      round(fv(p, "Dim"), 3),
        })
    return results

# ── RP RANKINGS ────────────────────────────────────────────────────────────────
def build_rp(proj_path, unavail, rfa_norm, pos_map, pos_by_name_team, budget, system_name,
             pos_by_last=None, replacement_level=None, rfa_matcher=None):
    # ── Global ranking: all players meeting stat minimum ──────────────────────
    all_qualified = get_scored_pool_cached("rp", proj_path)
    global_rank = {norm(p["Name"]): i+1 for i, p in enumerate(all_qualified)}

    # ── Auction pool: filter to available, assign Est_Value ───────────────────
    eligible = [p for p in all_qualified if not is_unavailable(p["Name"], unavail)]
    if replacement_level is not None:
        eligible = assign_est_values_vorp_pitcher(eligible, budget * RP_VALUE_SCALE, replacement_level)
    else:
        eligible = assign_est_values(eligible, budget * RP_VALUE_SCALE)

    results = []
    for i, p in enumerate(eligible):
        tier = 1 if i<8 else 2 if i<20 else 3 if i<50 else 4 if i<100 else 5
        results.append({
            "id": f"{system_name}_rp_{i}",
            "system": system_name,
            "rank": global_rank.get(norm(p["Name"]), i+1), "tier": tier,
            "est_value": p["Est_Value"],
            "repl_level": round(p.get("_repl_level", 0.0), 3),
            "name": p["Name"], "team": p.get("Team",""),
            "g": round(fv(p,"G"),1), "ip": round(fv(p,"IP"),1),
            "sv": round(fv(p,"SV"),1), "hld": round(fv(p,"HLD"),1),
            "bs": round(fv(p,"BS"),1), "k": round(fv(p,"SO"),1),
            "era": round(fv(p,"ERA"),3), "whip": round(fv(p,"WHIP"),3),
            "hra": round(fv(p,"HR"),1), "vijay": round(calc_vijay_per_g(p), 3),
            "war": round(fv(p,"WAR"),2),
            "ip_per_week": round(p.get("_ip_per_week", 0.0), 2),
            "era_weekly_impact": round(p.get("_raw_ERA", 0.0), 6),
            "whip_weekly_impact": round(p.get("_raw_aWHIP", 0.0), 6),
            "ldb_score": round(p["LDB_Score"],3),
            "rfa_team": get_rfa_team(p["Name"], rfa_norm, rfa_matcher),
            "positions": get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team",""), pos_by_last),
            "is_fry_keeper": p["Name"] in FRY_KEEPERS,
            # ATC volatility fields (computed by compute_vol_fields after build)
            "vol":      round(fv(p, "Vol"), 3),
            "inter_sd": round(fv(p, "InterSD"), 3),
            "intra_sd": round(fv(p, "IntraSD"), 3),
            "skew":     round(fv(p, "Skew"), 3),
            "dim":      round(fv(p, "Dim"), 3),
        })
    return results

# ── MERGE: pair ATC/BATX + OOPSY by name ──────────────────────────────────────
def merge_rankings(primary_list, secondary_list):
    """Merge secondary data into primary list by player name matching.
    Returns combined list with both systems' data on each player object."""
    sec_by_norm = {norm(p["name"]): p for p in secondary_list}
    sec_matcher = NameMatcher(sec_by_norm, fuzzy_threshold=0.88)
    
    merged = []
    for p in primary_list:
        sec = sec_matcher.get(p["name"])
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


# ── PL BATTER RANKINGS ─────────────────────────────────────────────────────────

def load_pl_batters(path):
    """Load PL batter rankings CSV -> dict keyed by normalised name."""
    if not path.exists():
        print(f"  [PL] {path.name} not found - skipping")
        return {}
    index = {}
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                pl_rank = int(row["PL_Rank"])
            except (ValueError, KeyError):
                continue
            tags_raw = row.get("Tags", "")
            pl_tags  = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []
            entry = {
                "pl_rank":      pl_rank,
                "pl_tier":      int(row.get("PL_Tier", 99)) if row.get("PL_Tier","").isdigit() else 99,
                "pl_tier_name": row.get("PL_Tier_Name", ""),
                "pl_tags":      pl_tags,
                "pl_note":      row.get("PL_Note", ""),
            }
            key = norm(row.get("Player", ""))
            index[key] = entry
    print(f"  [PL] Loaded {len(index)} Pitcher List batter rankings")
    return index


# PL smart-tag pass — called after merge_rankings + apply_notes for batters
_PL_QUALITATIVE_TAGS = policy_filter_tags({
    "SLEEPER", "BREAKOUT", "BOUNCE_BACK", "BUST", "STASH",
    "INJURED", "DTD", "IL_START", "DELAYED", "PLATOON",
    "DEEP_LEAGUE", "INJURY_RISK",
})

def apply_pl_batters(players, pl_index):
    """Inject pl_rank/tier/note + smart tags from PL into each batter record."""
    pl_matcher = NameMatcher(pl_index, fuzzy_threshold=0.88)
    for i, p in enumerate(players):
        ldb_rank = i + 1
        pl = pl_matcher.get(p["name"])

        if pl:
            p["pl_rank"]      = pl["pl_rank"]
            p["pl_tier"]      = pl["pl_tier"]
            p["pl_tier_name"] = pl["pl_tier_name"]
            p["pl_note"]      = pl["pl_note"]

            # Rank delta: +ve means PL values player MORE than LDB z-score
            delta = ldb_rank - pl["pl_rank"]

            existing = set(p.get("tags", []))
            new_tags = []

            # Propagate PL qualitative tags not already present
            for t in _PL_QUALITATIVE_TAGS:
                if t in pl["pl_tags"] and t not in existing:
                    new_tags.append(t)

            # Delta-based auto tags (only when no conflicting tag already set)
            all_tags_so_far = existing | set(new_tags)

            p["tags"] = list(existing) + [t for t in new_tags if t not in existing]
        else:
            p["pl_rank"]      = None
            p["pl_tier"]      = None
            p["pl_tier_name"] = ""
            p["pl_note"]      = ""

    return players

# ── PL SP INTEGRATION ─────────────────────────────────────────────────────────

# Tier-to-tags mapping: derived from PL's SP tier names
_PL_SP_TIER_TAGS = {
    4:  ["INJURY_RISK"],
    12: ["SLEEPER"],
    13: ["STASH", "INJURY_RISK"],
    14: ["SLEEPER"],
    15: ["SLEEPER"],                        # HIPSTER 1 — contrarian upside plays
    16: ["SLEEPER"],
    17: ["SLEEPER"],
    18: ["ROLE_UNCLEAR"],                   # Possible Job Upside
    19: ["ROLE_UNCLEAR", "STASH"],          # Dope But No Job
    20: ["SLEEPER"],
    21: ["PROSPECT", "STASH"],              # Potential 2026 Stud Prospect
    22: ["DEEP_LEAGUE"],                    # Toby 15-Team
    23: ["STASH", "INJURY_RISK"],           # Injury Stash 2
    24: ["ROLE_UNCLEAR"],                   # Potential Pickups If Things Go Right
    25: ["PROSPECT", "STASH"],              # Spec Add 2026 Prospect
    26: ["DEEP_LEAGUE"],
    27: ["DEEP_LEAGUE", "ROLE_UNCLEAR"],    # Toby 15-Team If Job
    28: ["ROLE_UNCLEAR", "STASH"],          # Kinda Cool But No Job
    29: ["PROSPECT", "STASH"],              # Stud Likely 2027 Prospect
    30: ["DEEP_LEAGUE"],
    31: [],                                 # Has Job But It's The Rockies (Coors)
    32: ["PROSPECT"],
    33: ["ROLE_UNCLEAR"],
    34: ["PROSPECT", "STASH"],              # Stud Likely 2028 Prospect
    35: ["ROLE_UNCLEAR"],                   # If Job Would Be For Rockies
    36: ["INJURED"],                        # Hurt But You Forgot
    37: ["ROLE_UNCLEAR", "BUST"],           # Hammock Or Mound?
    38: ["INJURED", "IL"],                  # Out For 2026 Just So You Know
    39: ["DEEP_LEAGUE", "ROLE_UNCLEAR"],    # The Rest Who Could Find Random Starts
    40: ["ROLE_UNCLEAR"],                   # He's In Japan, Jeez
}

_PL_SP_QUALITATIVE_TAGS = policy_filter_tags({
    "SLEEPER", "BREAKOUT", "BOUNCE_BACK", "BUST", "STASH",
    "INJURED", "IL", "DTD", "IL_START", "DELAYED", "ROLE_UNCLEAR",
    "DEEP_LEAGUE", "INJURY_RISK", "PROSPECT",
})


def load_pl_sp(path: Path) -> dict:
    """Load PL SP rankings CSV → dict keyed by normalised name.
    Derives tags from tier numbers since the SP file has no Tags column.
    """
    if not path.exists():
        print(f"  [PL-SP] {path.name} not found - skipping")
        return {}
    index = {}
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                pl_rank = int(row["Rank"])
            except (ValueError, KeyError):
                continue
            tier_num = int(row.get("Tier", 99)) if str(row.get("Tier","")).isdigit() else 99
            tier_tags = [t for t in _PL_SP_TIER_TAGS.get(tier_num, []) if is_tag_allowed(t)]
            entry = {
                "pl_rank":      pl_rank,
                "pl_tier":      tier_num,
                "pl_tier_name": row.get("Tier Name", ""),
                "pl_tags":      tier_tags,
                "pl_note":      "",           # no notes column in SP file
                "handedness":   row.get("R/L", ""),
            }
            key = norm(row.get("Player", ""))
            index[key] = entry
    print(f"  [PL-SP] Loaded {len(index)} Pitcher List SP rankings")
    return index


def apply_pl_sp(players: list, pl_index: dict) -> list:
    """Inject pl_rank/tier + smart tags from PL into each SP record."""
    pl_matcher = NameMatcher(pl_index, fuzzy_threshold=0.88)
    for i, p in enumerate(players):
        ldb_rank = i + 1
        pl = pl_matcher.get(p["name"])

        if pl:
            p["pl_rank"]      = pl["pl_rank"]
            p["pl_tier"]      = pl["pl_tier"]
            p["pl_tier_name"] = pl["pl_tier_name"]
            p["pl_note"]      = pl["pl_note"]
            if pl.get("handedness"):
                p["handedness"] = pl["handedness"]

            # Rank delta: +ve means PL values player MORE than LDB z-score
            delta = ldb_rank - pl["pl_rank"]

            existing = set(p.get("tags", []))
            new_tags = []

            # Inject tier-derived tags not already present
            for t in pl["pl_tags"]:
                if t in _PL_SP_QUALITATIVE_TAGS and t not in existing:
                    new_tags.append(t)

            # Delta-based auto tags — threshold 15 (SP pool is ~191 players)
            all_tags_so_far = existing | set(new_tags)

            p["tags"] = list(existing) + [t for t in new_tags if t not in existing]
        else:
            p["pl_rank"]      = None
            p["pl_tier"]      = None
            p["pl_tier_name"] = ""
            p["pl_note"]      = ""

    return players


def load_pl_rp(path: Path) -> dict:
    """Load PL RP rankings CSV -> dict keyed by normalized pitcher name."""
    if not path.exists():
        print(f"  [PL-RP] {path.name} not found - skipping")
        return {}
    index = {}
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                pl_rank = int(str(row.get("rank", "")).strip())
            except (ValueError, TypeError):
                continue
            key = norm(row.get("pitcher", ""))
            if not key:
                continue
            index[key] = {"pl_rp_rank": pl_rank}
    print(f"  [PL-RP] Loaded {len(index)} PL RP rankings")
    return index


def apply_pl_rp(players: list, pl_rp_index: dict) -> list:
    """Inject PL RP rank into RP player records."""
    rp_matcher = NameMatcher(pl_rp_index, fuzzy_threshold=0.88)
    for p in players:
        entry = rp_matcher.get(p["name"])
        p["pl_rp_rank"] = entry["pl_rp_rank"] if entry else None
        if entry and "SP" in [str(x).upper() for x in (p.get("positions") or [])]:
            tags = list(p.get("tags", []))
            if "PL_RP_SP_ELIG" not in tags:
                p["tags"] = tags + ["PL_RP_SP_ELIG"]
    return players


# ── PLAYER NOTES & SMART TAGS ─────────────────────────────────────────────────

def load_player_notes(path: Path) -> tuple[dict, dict]:
    """Load player_notes.json → (notes_index, manual_notes).
    notes_index: dict keyed by normalised name from players array.
    manual_notes: dict keyed by normalised name (UI-added notes, take precedence).
    """
    if not path.exists():
        print(f"  [notes] {path.name} not found - skipping qualitative data")
        return {}, {}
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    index = {}
    for entry in raw.get("players", []):
        key = norm(entry["name"])
        index[key] = entry
    manual = raw.get("manual_notes") or {}
    if not isinstance(manual, dict):
        manual = {}
    print(f"  [notes] Loaded {len(index)} player notes, {len(manual)} manual notes from {path.name}")
    return index, manual


def auto_tags_batter(p: dict) -> list:
    """Generate stat-based tags for a batter."""
    tags = []
    asb   = p.get("_raw_aSB", 0)
    obp   = fv(p, "OBP")
    ops   = fv(p, "OPS")
    hr    = fv(p, "HR")
    war   = fv(p, "WAR")
    pa    = fv(p, "PA")
    vol_z = p.get("vol_z", 0.0) or 0.0
    skew  = p.get("skew") or 0.0
    if war >= 5.0:                              tags.append("ELITE")
    if ops >= 0.900:                             tags.append("POWER_OBP")
    if obp >= 0.370 and ops < 0.820:            tags.append("OBP_ONLY")
    if hr >= 35:                                 tags.append("HR_THREAT")
    if asb >= 25:                                tags.append("SB_THREAT")
    if war >= 3.5 and pa >= 550:                tags.append("WORKHORSE")
    if war < 1.5 and pa >= 400:                 tags.append("DEEP_LEAGUE")
    # ATC volatility tags
    if vol_z < -0.75:                            tags.append("HIGH_FLOOR")
    if vol_z > 0.75:                             tags.append("VOLATILE")
    if skew > 1.5:                               tags.append("UPSIDE_PLAY")
    if skew < -1.5:                              tags.append("BUST_RISK")
    return tags


def auto_tags_sp(p: dict) -> list:
    """Generate stat-based tags for a SP."""
    tags = []
    k     = fv(p, "SO")
    era   = fv(p, "ERA")
    whip  = fv(p, "WHIP")
    hr    = fv(p, "HR")
    ip    = fv(p, "IP")
    gs    = fv(p, "GS")
    war   = fv(p, "WAR")
    mgs   = p.get("_raw_MGS", 0) / gs if gs > 0 else 0
    vol_z = p.get("vol_z", 0.0) or 0.0
    skew  = p.get("skew") or 0.0
    if war >= 5.0:                               tags.append("ELITE")
    if k >= 220:                                 tags.append("K_MACHINE")
    if era <= 3.00 and whip <= 1.10:            tags.append("RATIOS_ACE")
    if hr <= 12 and ip >= 160:                  tags.append("GB_PITCHER")
    if mgs >= 11:                                tags.append("MGS_ELITE")
    if ip >= 185:                                tags.append("WORKHORSE")
    if gs >= 28 and war >= 3.0:                 tags.append("INNINGS_EAT")
    if war < 1.5 and ip >= 120:                 tags.append("DEEP_LEAGUE")
    # ATC volatility tags
    if vol_z < -0.75:                            tags.append("HIGH_FLOOR")
    if vol_z > 0.75:                             tags.append("VOLATILE")
    if skew > 1.5:                               tags.append("UPSIDE_PLAY")
    if skew < -1.5:                              tags.append("BUST_RISK")
    return tags


def auto_tags_rp(p: dict) -> list:
    """Generate stat-based tags for a RP."""
    tags = []
    sv    = fv(p, "SV")
    hld   = fv(p, "HLD")
    bs    = fv(p, "BS")
    era   = fv(p, "ERA")
    vijay = p.get("_raw_VIJAY", 0)
    g     = fv(p, "G")
    vol_z = p.get("vol_z", 0.0) or 0.0
    skew  = p.get("skew") or 0.0
    if sv >= 28:                                         tags.append("CLOSER")
    if hld >= 20:                                        tags.append("HOLDS_VALUE")
    if sv >= 20 and bs <= 3:                            tags.append("SAVES_SAFE")
    if bs >= 6:                                          tags.append("CLOSER_RISK")
    if era <= 2.50:                                      tags.append("ELITE_ERA")
    if vijay / g >= 0.45 if g > 0 else False:           tags.append("VIJAY_ELITE")
    if vijay / g < 0.15 if g > 0 else False:            tags.append("DEEP_LEAGUE")
    positions = [str(x).upper() for x in (p.get("positions") or [])]
    if "SP" in positions:
        tags.append("RP_SP_ELIG")
    # ATC volatility tags
    if vol_z < -0.75:                                    tags.append("HIGH_FLOOR")
    if vol_z > 0.75:                                     tags.append("VOLATILE")
    if skew > 1.5:                                       tags.append("UPSIDE_PLAY")
    if skew < -1.5:                                      tags.append("BUST_RISK")
    return tags


TAG_AUTO_FN = {"batters": auto_tags_batter, "sp": auto_tags_sp, "rp": auto_tags_rp}


# ── ATC VOLATILITY INTEGRATION ────────────────────────────────────────────────

def load_atc_batter_vol(path: Path) -> NameMatcher:
    """Load ATC batter CSV → NameMatcher with Vol/InterSD/IntraSD/Skew/Dim fields.
    Used to cross-join vol signals onto BATX batter records by name.
    """
    if not path.exists():
        print(f"  [ATC-vol] {path.name} not found — vol cross-join skipped for batters")
        return NameMatcher({}, fuzzy_threshold=0.88)
    index = {}
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            key = norm(row.get("Name", ""))
            if not key:
                continue
            def _fv(col, r=row):
                try:
                    v = float(r.get(col, "") or 0)
                    return v if v != 0 else None
                except (ValueError, TypeError):
                    return None
            index[key] = {
                "vol":      _fv("Vol"),
                "inter_sd": _fv("InterSD"),
                "intra_sd": _fv("IntraSD"),
                "skew":     _fv("Skew"),
                "dim":      _fv("Dim"),
            }
    print(f"  [ATC-vol] Loaded vol data for {len(index)} batters from {path.name}")
    return NameMatcher(index, fuzzy_threshold=0.88)


def apply_atc_vol_to_batters(players: list, atc_vol_matcher: NameMatcher) -> list:
    """Cross-join ATC vol fields onto primary (BATX) batter records by name.
    Injects: vol, inter_sd, intra_sd, skew, dim (None when not found).
    """
    matched = 0
    unmatched = []
    for p in players:
        entry = atc_vol_matcher.get(p["name"])
        if entry:
            p["vol"]      = entry.get("vol")
            p["inter_sd"] = entry.get("inter_sd")
            p["intra_sd"] = entry.get("intra_sd")
            p["skew"]     = entry.get("skew")
            p["dim"]      = entry.get("dim")
            matched += 1
        else:
            p["vol"] = p["inter_sd"] = p["intra_sd"] = p["skew"] = p["dim"] = None
            unmatched.append(p["name"])
    coverage = (matched / len(players) * 100.0) if players else 0.0
    print(f"  [ATC-vol] Cross-joined vol onto {matched}/{len(players)} BATX batters ({coverage:.1f}% coverage)")
    if unmatched:
        preview = ", ".join(unmatched[:10])
        if len(unmatched) > 10:
            preview += ", ..."
        print(f"  [ATC-vol] Unmatched BATX batters ({len(unmatched)}): {preview}")
    return players


def compute_vol_fields(players: list) -> list:
    """Compute pool-relative vol stats (vol_z, vol_mult) only.

    Runtime valuation in auctionStore.jsx is the single source-of-truth for
    risk-adjusted value application (vol_mult affects positive VORP there).

    vol_z    — robust z-score of player Vol vs pool median + MAD scale.
    vol_mult — smooth risk multiplier in [0.80, 1.15];
               lower = more volatile = stronger discount.

    Expects players to already have volatility fields injected.
    Players with vol=None/0 get neutral vol_z=0.0, vol_mult=1.0.
    """
    vol_vals = [p["vol"] for p in players if p.get("vol") is not None and p["vol"] > 0]
    if not vol_vals:
        for p in players:
            p.setdefault("vol_z", 0.0)
            p.setdefault("vol_mult", 1.0)
        return players

    pool_median = statistics.median(vol_vals)
    abs_dev = [abs(v - pool_median) for v in vol_vals]
    mad = statistics.median(abs_dev) if abs_dev else 0.0
    robust_sigma = mad * 1.4826 if mad > 0 else 0.0
    # Fallback for degenerate MAD pools.
    if robust_sigma <= 0:
        robust_sigma = statistics.stdev(vol_vals) if len(vol_vals) > 1 else 1.0

    for p in players:
        v = p.get("vol")
        if v is not None and v > 0 and robust_sigma > 0:
            vol_z = (v - pool_median) / robust_sigma
            # Smooth bounded curve: avoids hard clipping plateaus in tails.
            vol_mult = 1.0 - (0.17 * math.tanh(vol_z / 1.8))
            vol_mult = max(0.80, min(1.15, vol_mult))
        else:
            vol_z, vol_mult = 0.0, 1.0
        p["vol_z"]    = round(vol_z, 3)
        p["vol_mult"] = round(vol_mult, 4)

    return players


# ── ATHLETIC SP RANKINGS ───────────────────────────────────────────────────────

def load_athletic_sp(path: Path) -> dict:
    """Load Athletic SP rankings CSV → dict keyed by normalised name.
    Columns: Rank, Name, Team, Stuff+, Location+, Pitching+, Health%, Proj_IP, ppERA, ppK%
    """
    if not path.exists():
        print(f"  [Athletic] {path.name} not found - skipping")
        return {}
    index = {}
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                athl_rank = int(row["Rank"])
            except (ValueError, KeyError):
                continue
            # Health% stored as "87%" — strip the percent sign
            health_raw = row.get("Health%", "").replace("%", "").strip()
            try:
                health_val = float(health_raw)
            except ValueError:
                health_val = None
            entry = {
                "athl_rank":     athl_rank,
                "stuff_plus":    round(float(row.get("Stuff+", 0) or 0)),
                "location_plus": round(float(row.get("Location+", 0) or 0)),
                "pitching_plus": round(float(row.get("Pitching+", 0) or 0)),
                "athl_health":   health_val,
                "athl_ip":       round(float(row.get("Proj_IP", 0) or 0), 1),
                "pp_era":        round(float(row.get("ppERA", 0) or 0), 2),
                "pp_k_pct":      round(float(row.get("ppK%", 0) or 0), 1),
            }
            key = norm(row.get("Name", ""))
            index[key] = entry
    print(f"  [Athletic] Loaded {len(index)} Athletic SP rankings")
    return index


def apply_athletic_sp(players: list, athl_index: dict) -> list:
    """Inject Athletic SP fields into each SP record."""
    matched = 0
    athl_matcher = NameMatcher(athl_index, fuzzy_threshold=0.88)
    for p in players:
        athl = athl_matcher.get(p["name"])
        if athl:
            p["athl_rank"]     = athl["athl_rank"]
            p["stuff_plus"]    = athl["stuff_plus"]
            p["location_plus"] = athl["location_plus"]
            p["pitching_plus"] = athl["pitching_plus"]
            p["athl_health"]   = athl["athl_health"]
            p["athl_ip"]       = athl["athl_ip"]
            p["pp_era"]        = athl["pp_era"]
            p["pp_k_pct"]      = athl["pp_k_pct"]
            matched += 1
        else:
            p["athl_rank"]     = None
            p["stuff_plus"]    = None
            p["location_plus"] = None
            p["pitching_plus"] = None
            p["athl_health"]   = None
            p["athl_ip"]       = None
            p["pp_era"]        = None
            p["pp_k_pct"]      = None
    print(f"  [Athletic] Matched {matched}/{len(players)} SP players")
    return players


def apply_notes(players: list, notes_index: dict, manual_notes: dict, pool_type: str) -> list:
    """Merge manual notes + auto tags into each player record.
    manual_notes (UI-added) take precedence over note_entry.note.
    """
    auto_fn = TAG_AUTO_FN.get(pool_type)
    note_matcher = NameMatcher(notes_index, fuzzy_threshold=0.88)
    for p in players:
        key = norm(p["name"])
        note_entry = note_matcher.get(p["name"])
        auto = auto_fn(p) if auto_fn else []
        manual_tags = list(note_entry.get("tags", [])) if note_entry else []
        all_tags = list(dict.fromkeys(manual_tags + [t for t in auto if t not in manual_tags]))
        all_tags = [t for t in all_tags if is_tag_allowed(t)]
        p["tags"]       = all_tags
        # Manual note (from UI) overrides note from players array
        if key in manual_notes and manual_notes[key]:
            p["note"] = manual_notes[key]
        else:
            p["note"] = (note_entry or {}).get("note", "")
        p["health_pct"] = (note_entry or {}).get("health_pct", 100)
        p["role"]       = (note_entry or {}).get("role", "")
    return players


def _zscore_map(metric_by_team: dict) -> dict:
    vals = list(metric_by_team.values())
    if not vals:
        return {k: 0.0 for k in metric_by_team}
    mean = statistics.mean(vals)
    stdev = statistics.stdev(vals) if len(vals) > 1 else 0.0
    if stdev == 0:
        return {k: 0.0 for k in metric_by_team}
    return {k: (v - mean) / stdev for k, v in metric_by_team.items()}


def _fmt_signed_money(v: float) -> str:
    sign = "+" if v >= 0 else "-"
    return f"${sign}{abs(v):.1f}M"


def _fmt_signed_num(v: float) -> str:
    sign = "+" if v >= 0 else "-"
    return f"{sign}{abs(v):.1f}"


def _safe_avg(values: list[float]) -> float:
    vals = [v for v in values if v is not None]
    return statistics.mean(vals) if vals else 0.0


def build_team_vorp_context(board, repl_bat_by_system, repl_pit_by_system, pos_map, pos_by_name_team, pos_by_last):
    """
    Build per-team VORP totals for owned (non-AA) players and AA impact details.
    VORP definitions:
      - Batters: avg(BATX VORP, OOPSY VORP), with VORP vs positional replacement.
      - SP/RP: avg(ATC VORP, OOPSY VORP) within role pool.
    """
    # Batters
    batx_pool = get_scored_pool_cached("bat", BATX_BATTERS)
    oopsy_bat_pool = get_scored_pool_cached("bat", OOPSY_BATTERS)
    batx_map = {}
    oopsy_bat_map = {}
    for p in batx_pool:
        positions = normalize_pos_for_repl(
            get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team", ""), pos_by_last)
        )
        repls = [repl_bat_by_system["batx"][pos] for pos in positions if pos in repl_bat_by_system["batx"]]
        batx_map[norm(p["Name"])] = max(0.0, p["LDB_Score"] - (min(repls) if repls else 0.0))
    for p in oopsy_bat_pool:
        positions = normalize_pos_for_repl(
            get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team", ""), pos_by_last)
        )
        repls = [repl_bat_by_system["oopsy"][pos] for pos in positions if pos in repl_bat_by_system["oopsy"]]
        oopsy_bat_map[norm(p["Name"])] = max(0.0, p["LDB_Score"] - (min(repls) if repls else 0.0))

    # Pitchers
    atc_sp_pool = get_scored_pool_cached("sp", ATC_SP)
    oopsy_sp_pool = get_scored_pool_cached("sp", OOPSY_SP)
    atc_rp_pool = get_scored_pool_cached("rp", ATC_RP)
    oopsy_rp_pool = get_scored_pool_cached("rp", OOPSY_RP)
    atc_sp_map = {norm(p["Name"]): max(0.0, p["LDB_Score"] - repl_pit_by_system["atc"]["SP"]) for p in atc_sp_pool}
    oopsy_sp_map = {norm(p["Name"]): max(0.0, p["LDB_Score"] - repl_pit_by_system["oopsy"]["SP"]) for p in oopsy_sp_pool}
    atc_rp_map = {norm(p["Name"]): max(0.0, p["LDB_Score"] - repl_pit_by_system["atc"]["RP"]) for p in atc_rp_pool}
    oopsy_rp_map = {norm(p["Name"]): max(0.0, p["LDB_Score"] - repl_pit_by_system["oopsy"]["RP"]) for p in oopsy_rp_pool}

    # Unified VORP map by name (best role for pitcher-eligible players)
    vorp_by_name = {}
    all_names = (
        set(batx_map.keys()) | set(oopsy_bat_map.keys()) |
        set(atc_sp_map.keys()) | set(oopsy_sp_map.keys()) |
        set(atc_rp_map.keys()) | set(oopsy_rp_map.keys())
    )
    for n in all_names:
        bat_v = _safe_avg([batx_map.get(n), oopsy_bat_map.get(n)])
        sp_v = _safe_avg([atc_sp_map.get(n), oopsy_sp_map.get(n)])
        rp_v = _safe_avg([atc_rp_map.get(n), oopsy_rp_map.get(n)])
        vorp_by_name[n] = max(bat_v, sp_v, rp_v)
    vorp_matcher = NameMatcher(vorp_by_name, fuzzy_threshold=0.87)

    # Team totals (owned only = excludes AA by construction)
    team_vorp = {abbr: 0.0 for abbr in board["teams"]}
    for name, info in board["owned"].items():
        team_vorp[info["team"]] += float(vorp_matcher.get(name) or 0.0)

    owned_vorp_by_name = {}
    for name in board["owned"].keys():
        owned_vorp_by_name[name] = float(vorp_matcher.get(name) or 0.0)

    aa_detail_by_team = {}
    for abbr, aa_list in board.get("aa_by_team", {}).items():
        rows = []
        for aa_name in aa_list:
            aa_v = float(vorp_matcher.get(aa_name) or 0.0)
            # Best-effort role classification for display
            pos = get_positions(aa_name, pos_map, pos_by_name_team, pos_by_last=pos_by_last)
            role = "BAT"
            up = {str(p).upper() for p in (pos or [])}
            if "SP" in up:
                role = "SP"
            elif "RP" in up:
                role = "RP"
            rows.append({"name": aa_name, "role": role, "vorp": aa_v})
        rows.sort(key=lambda x: x["vorp"], reverse=True)
        aa_detail_by_team[abbr] = rows

    return team_vorp, owned_vorp_by_name, aa_detail_by_team


def build_owned_marginal_auction_values(
    board, pos_map, pos_by_name_team, pos_by_last, unavail_idx,
    repl_bat_by_system, repl_pit_by_system, hit_budget, sp_budget, rp_budget
):
    """
    Compute marginal auction price for each owned player by adding that single player
    to the current available pool and pricing with the same replacement levels/budgets.
    Uses primary systems: BATX (bat), ATC (SP/RP).
    """
    # Mirror live auction opportunity-cost model from src/store/auctionStore.jsx.
    LEAGUE_MIN_BID = 0.5
    IN_SEASON_CARRY_RESERVE = 5.0
    OC_PREMIUM_START_MULTIPLE = 3.0
    OC_ALPHA = 0.3
    OC_MIN_PENALTY = 0.75
    BATTER_SLOTS_PER_TEAM = 11
    SP_SLOTS_PER_TEAM = 6
    RP_SLOTS_PER_TEAM = 3

    def round_half(v: float) -> float:
        return round(v * 2) / 2

    def effective_auction_budget_for_team(team_state: dict) -> float:
        budget = float(team_state.get("budget_rem", 0) or 0)
        slots = max(0, int(team_state.get("slots_rem", 0) or 0))
        required_reserve = (slots * LEAGUE_MIN_BID) + IN_SEASON_CARRY_RESERVE
        return max(0.0, budget - required_reserve)

    def demand_limited_positive_mass(vals: list[float], slots_to_fill: int) -> float:
        if slots_to_fill <= 0:
            return 0.0
        top = sorted((v for v in vals if v > 0), reverse=True)[:slots_to_fill]
        return sum(top)

    def oc_adjusted_value(player_vorp: float, total_positive_vorp: float, pool_budget: float, slots_to_fill: int) -> float:
        if player_vorp <= 0 or total_positive_vorp <= 0 or pool_budget <= 0:
            return 0.5
        dollars_per_vorp = pool_budget / total_positive_vorp
        linear_raw = player_vorp * dollars_per_vorp
        if slots_to_fill > 0:
            avg_slot_spend = pool_budget / max(1, slots_to_fill)
            spend_multiple = (linear_raw / avg_slot_spend) if avg_slot_spend > 0 else 1.0
            excess = max(0.0, spend_multiple - OC_PREMIUM_START_MULTIPLE)
            base_penalty = 1.0 / (1.0 + (OC_ALPHA * math.log1p(excess)))
            penalty = max(OC_MIN_PENALTY, base_penalty)
            linear_raw = linear_raw * penalty
        return max(0.5, round_half(linear_raw))

    # Build per-pool VORP maps for all qualified players.
    bat_pool = get_scored_pool_cached("bat", BATX_BATTERS)
    bat_vorp = {}
    for p in bat_pool:
        positions = normalize_pos_for_repl(
            get_positions(p["Name"], pos_map, pos_by_name_team, p.get("Team", ""), pos_by_last)
        )
        repls = [repl_bat_by_system["batx"][pos] for pos in positions if pos in repl_bat_by_system["batx"]]
        bat_vorp[norm(p["Name"])] = max(0.0, p["LDB_Score"] - (min(repls) if repls else 0.0))

    sp_pool = get_scored_pool_cached("sp", ATC_SP)
    rp_pool = get_scored_pool_cached("rp", ATC_RP)
    sp_vorp = {norm(p["Name"]): max(0.0, p["LDB_Score"] - repl_pit_by_system["atc"]["SP"]) for p in sp_pool}
    rp_vorp = {norm(p["Name"]): max(0.0, p["LDB_Score"] - repl_pit_by_system["atc"]["RP"]) for p in rp_pool}

    bat_matcher = NameMatcher(bat_vorp, fuzzy_threshold=0.87)
    sp_matcher = NameMatcher(sp_vorp, fuzzy_threshold=0.87)
    rp_matcher = NameMatcher(rp_vorp, fuzzy_threshold=0.87)

    # Base available pool VORP vectors (excluding owned+AA).
    base_bat_vals = [
        bat_vorp.get(norm(p["Name"]), 0.0)
        for p in bat_pool
        if not is_unavailable(p["Name"], unavail_idx)
    ]
    base_sp_vals = [
        sp_vorp.get(norm(p["Name"]), 0.0)
        for p in sp_pool
        if not is_unavailable(p["Name"], unavail_idx)
    ]
    base_rp_vals = [
        rp_vorp.get(norm(p["Name"]), 0.0)
        for p in rp_pool
        if not is_unavailable(p["Name"], unavail_idx)
    ]

    num_teams = len(board["teams"])
    batter_slots_to_fill = BATTER_SLOTS_PER_TEAM * num_teams
    sp_slots_to_fill = SP_SLOTS_PER_TEAM * num_teams
    rp_slots_to_fill = RP_SLOTS_PER_TEAM * num_teams

    total_effective_budget = sum(
        effective_auction_budget_for_team(tstate)
        for tstate in board["teams"].values()
    )

    marginal = {}
    for name, info in board["owned"].items():
        pos_label = str(info.get("pos", "")).upper()
        # Prefer explicit draft-board role labels.
        if "SP" in pos_label:
            role = "SP"
        elif "RP" in pos_label:
            role = "RP"
        else:
            # Fallback to eligibility when label is generic (e.g. SN/HTH variants).
            positions = {str(x).upper() for x in (get_positions(name, pos_map, pos_by_name_team, pos_by_last=pos_by_last) or [])}
            if "SP" in positions:
                role = "SP"
            elif "RP" in positions:
                role = "RP"
            else:
                role = "BAT"

        bat_vals = list(base_bat_vals)
        sp_vals = list(base_sp_vals)
        rp_vals = list(base_rp_vals)

        if role == "SP":
            v = float(sp_matcher.get(name) or 0.0)
            sp_vals.append(v)
        elif role == "RP":
            v = float(rp_matcher.get(name) or 0.0)
            rp_vals.append(v)
        else:
            v = float(bat_matcher.get(name) or 0.0)
            bat_vals.append(v)

        bat_mass = demand_limited_positive_mass(bat_vals, batter_slots_to_fill)
        sp_mass = demand_limited_positive_mass(sp_vals, sp_slots_to_fill)
        rp_mass = demand_limited_positive_mass(rp_vals, rp_slots_to_fill)
        total_mass = bat_mass + sp_mass + rp_mass

        if total_mass > 0:
            live_hit_budget = total_effective_budget * (bat_mass / total_mass)
            live_sp_budget = total_effective_budget * (sp_mass / total_mass)
            live_rp_budget = total_effective_budget * (rp_mass / total_mass)
        else:
            live_hit_budget = total_effective_budget / 3.0
            live_sp_budget = total_effective_budget / 3.0
            live_rp_budget = total_effective_budget / 3.0

        if role == "SP":
            total_positive = sum(x for x in sp_vals if x > 0)
            marginal[name] = oc_adjusted_value(v, total_positive, live_sp_budget, sp_slots_to_fill)
        elif role == "RP":
            total_positive = sum(x for x in rp_vals if x > 0)
            marginal[name] = oc_adjusted_value(v, total_positive, live_rp_budget, rp_slots_to_fill)
        else:
            total_positive = sum(x for x in bat_vals if x > 0)
            marginal[name] = oc_adjusted_value(v, total_positive, live_hit_budget, batter_slots_to_fill)

    return marginal


def write_auction_preview_md(board, roster_by_team, team_vorp, aa_detail_by_team, rfa_by_team):
    teams = board["teams"]
    team_rows = []
    marginal_surplus_by_team = {}
    dps_by_team = {}
    keepers_by_team = {}

    for abbr, roster in roster_by_team.items():
        team_salary_total = 0.0
        team_marginal_total = 0.0
        bat_k = 0
        pit_k = 0
        for p in roster:
            sal = float(p.get("salary", 0) or 0)
            team_salary_total += sal
            mv = p.get("marginal_auction_value")
            if mv is not None:
                team_marginal_total += float(mv)
            positions = {str(x).upper() for x in (p.get("positions") or [])}
            if "SP" in positions or "RP" in positions:
                pit_k += 1
            else:
                bat_k += 1
        marginal_surplus = team_marginal_total - team_salary_total
        marginal_surplus_by_team[abbr] = marginal_surplus
        keepers_by_team[abbr] = {"total": len(roster), "bat": bat_k, "pit": pit_k}
        slots = max(1, int(teams[abbr]["slots_rem"]))
        dps_by_team[abbr] = float(teams[abbr]["budget_rem"]) / slots

    z_surplus = _zscore_map(marginal_surplus_by_team)
    z_vorp = _zscore_map(team_vorp)
    z_dps = _zscore_map(dps_by_team)
    composite_raw = {
        abbr: (z_surplus[abbr] + z_vorp[abbr] + z_dps[abbr]) / 3.0
        for abbr in teams
    }
    raw_vals = list(composite_raw.values())
    min_raw = min(raw_vals) if raw_vals else 0.0
    max_raw = max(raw_vals) if raw_vals else 1.0
    scale = (max_raw - min_raw) if (max_raw - min_raw) > 0 else 1.0
    composite = {abbr: round(((composite_raw[abbr] - min_raw) / scale) * 100) for abbr in teams}

    for abbr in teams:
        aa_rows = aa_detail_by_team.get(abbr, [])
        aa_impact_count = len([r for r in aa_rows if r["vorp"] > 0])
        aa_impact_vorp = sum(r["vorp"] for r in aa_rows if r["vorp"] > 0)
        team_rows.append({
            "abbr": abbr,
            "gm": teams[abbr]["gm"],
            "budget": float(teams[abbr]["budget_rem"]),
            "slots": int(teams[abbr]["slots_rem"]),
            "composite": composite[abbr],
            "surplus": marginal_surplus_by_team[abbr],
            "vorp": team_vorp[abbr],
            "dps": dps_by_team[abbr],
            "keepers_total": keepers_by_team[abbr]["total"],
            "keepers_bat": keepers_by_team[abbr]["bat"],
            "keepers_pit": keepers_by_team[abbr]["pit"],
            "aa_impact_count": aa_impact_count,
            "aa_impact_vorp": aa_impact_vorp,
        })

    team_rows.sort(key=lambda x: x["composite"], reverse=True)
    total_pool = sum(float(teams[a]["budget_rem"]) for a in teams)

    lines = []
    lines.append("# LDB 2026 League-Wide Auction Preview")
    lines.append("")
    lines.append(
        "*Composite = 33% z-score total marginal surplus + 33% z-score total keeper VORP (excluding AA) "
        "+ 33% z-score $/slot, scaled 0-100 · "
        "VORP = avg BATX+OOPSY (bat) / ATC+OOPSY (pit) vs. positional replacement level · "
        f"{len(teams)} teams · ${round(total_pool):.0f}M total pool*"
    )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## At a Glance")
    lines.append("")
    lines.append("| Rank | Team | GM | Composite | Surplus | VORP | $/Slot | Budget | Slots | Keepers | AA Impact |")
    lines.append("|------|------|----|-----------|---------|------|--------|--------|-------|---------|-----------|")
    for i, t in enumerate(team_rows, start=1):
        aa_cell = str(t["aa_impact_count"]) if t["aa_impact_count"] > 0 else "—"
        lines.append(
            f"| {i} | **{t['abbr']}** | {t['gm']} | **{t['composite']}** | {_fmt_signed_money(t['surplus'])} "
            f"| {_fmt_signed_num(t['vorp'])} | ${t['dps']:.1f}M | ${t['budget']:.1f}M | {t['slots']} "
            f"| {t['keepers_total']} | {aa_cell} |"
        )

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Team-by-Team Breakdown")
    lines.append("")

    for i, t in enumerate(team_rows, start=1):
        abbr = t["abbr"]
        roster = roster_by_team.get(abbr, [])
        lines.append(f"### {i}. {abbr} — {t['gm']}")
        lines.append("")
        lines.append(
            f"**Composite: {t['composite']}/100** · Surplus: {_fmt_signed_money(t['surplus'])} "
            f"· Keeper VORP: {_fmt_signed_num(t['vorp'])} · Budget: ${t['budget']:.1f}M "
            f"· {t['slots']} slots · {t['keepers_total']} keepers ({t['keepers_bat']} bat / {t['keepers_pit']} pitch)"
        )
        lines.append("")

        # All owned keepers
        keeper_rows = []
        for p in roster:
            tv = p.get("theoretical_value")
            if tv is None:
                continue
            sal = float(p.get("salary", 0) or 0)
            keeper_rows.append({
                "name": p["name"],
                "salary": sal,
                "tv": float(tv),
                "marginal": p.get("marginal_auction_value"),
                "player_vorp": float(p.get("keeper_vorp") or 0.0),
                "surplus": float(tv) - sal,
                "contract": p.get("contract", ""),
                "vorp": team_vorp.get(abbr, 0.0),  # placeholder for prose consistency
            })
        keeper_rows.sort(key=lambda x: x["surplus"], reverse=True)

        lines.append("**All Keepers:**")
        lines.append("")
        if keeper_rows:
            lines.append("| Player | Salary | Theo Value | Surplus | VORP | Marginal Auction | Contract |")
            lines.append("|--------|--------|------------|---------|------|------------------|----------|")
            for k in keeper_rows:
                marginal_txt = f"${float(k['marginal']):.1f}M" if k.get("marginal") is not None else "—"
                lines.append(
                    f"| {k['name']} | ${k['salary']:.1f}M | ${k['tv']:.1f}M | {_fmt_signed_money(k['surplus'])} "
                    f"| {_fmt_signed_num(k['player_vorp'])} | {marginal_txt} | {k['contract'] or '—'} |"
                )
        else:
            lines.append("- No keeper entries found.")
        aa_rows = aa_detail_by_team.get(abbr, [])
        lines.append("")

        impact = [r for r in aa_rows if r["vorp"] > 0]
        if aa_rows:
            lines.append(
                f"**AA Pipeline** ({len(impact)} impact player{'s' if len(impact) != 1 else ''} from {len(aa_rows)} total "
                f"· combined VORP {_fmt_signed_num(sum(r['vorp'] for r in impact))}):"
            )
            lines.append("")
            for r in impact[:4]:
                lines.append(f"- {r['name']} ({r['role']}) — avg VORP {_fmt_signed_num(r['vorp'])}")
            lines.append("")

        rfas = rfa_by_team.get(abbr, [])
        if rfas:
            lines.append(f"**RFA Rights:** {', '.join(rfas)}")
            lines.append("")

        lines.append("---")
        lines.append("")

    with open(OUTPUT_PREVIEW_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines).rstrip() + "\n")
    print(f"  [OK] Written auction preview to {OUTPUT_PREVIEW_MD}")

def main():
    print("=" * 60)
    print("LDB 2026 Data Generation")
    print("=" * 60)
    print(f"[tag-policy] allowed={len(ALLOWED_TAGS)} blocked={len(BLOCKED_TAGS)} from {TAG_POLICY_FILE.name}")

    print("\n[1/6] Parsing draft board...")
    board = parse_draft_board(DRAFT_BOARD)
    unavail     = board["all_unavailable"]
    unavail_idx = build_unavail_index(unavail)   # fast O(1)/O(k) lookup index
    teams        = board["teams"]
    total_budget = board["total_budget"]
    print(f"  Teams: {len(teams)}  |  Total pool: ${total_budget:.2f}M")
    print(f"  Owned: {len(board['owned'])}  |  AA: {len(board['aa_names'])}")

    print("\n[2/6] Parsing RFA rights...")
    rfa_norm, rfa_by_team = parse_rfa(RFA_FILE)
    rfa_matcher = NameMatcher(rfa_norm, fuzzy_threshold=0.85)
    fry_rfa = [p for p, t in rfa_norm.items() if t == FRY_TEAM]
    print(f"  RFA entries: {len(rfa_norm)}  |  FRY ROFR: {fry_rfa}")

    print("\n[3/6] Parsing CBS positional eligibility...")
    pos_map, pos_by_name_team, pos_by_last = parse_positions_cbs(CBS_BAT_ELIG, CBS_SP_ELIG, CBS_RP_ELIG)
    print(f"  Players with eligibility: {len(pos_map)}")

    print(f"\n[3.5] Building full-pool theoretical values ({len(teams)} teams x ${FULL_TEAM_BUDGET:.0f}M)...")
    theoretical_values, tv_by_last = build_full_pool_values(
        len(teams), pos_map, pos_by_name_team, pos_by_last)

    hit_budget = total_budget * HIT_SPLIT
    sp_budget  = total_budget * SP_SPLIT
    rp_budget  = total_budget * RP_SPLIT
    print(f"\n[4/6] Budget splits: Hit=${hit_budget:.0f}M  SP=${sp_budget:.0f}M  RP=${rp_budget:.0f}M")

    num_teams = len(teams)
    print(f"\n[4.5] Computing scarcity-based replacement levels ({num_teams} teams)...")
    repl_bat_by_system = {
        "batx": compute_batter_replacement_levels(
            BATX_BATTERS, board["owned"], set(board["aa_names"]),
            pos_map, pos_by_name_team, pos_by_last, num_teams=num_teams),
        "oopsy": compute_batter_replacement_levels(
            OOPSY_BATTERS, board["owned"], set(board["aa_names"]),
            pos_map, pos_by_name_team, pos_by_last, num_teams=num_teams),
    }
    repl_pit_by_system = {
        "atc": compute_pitcher_replacement_levels(
            ATC_SP, ATC_RP, board["owned"], set(board["aa_names"]), num_teams=num_teams),
        "oopsy": compute_pitcher_replacement_levels(
            OOPSY_SP, OOPSY_RP, board["owned"], set(board["aa_names"]), num_teams=num_teams),
    }

    print("  BATX batter replacement levels (LDB_Score):")
    for pos, rl in sorted(repl_bat_by_system["batx"].items()):
        print(f"    {pos:<4} {rl:+.3f}  (slots/team={REPL_BAT_SLOTS.get(pos,'?')})")
    print("  OOPSY batter replacement levels (LDB_Score):")
    for pos, rl in sorted(repl_bat_by_system["oopsy"].items()):
        print(f"    {pos:<4} {rl:+.3f}  (slots/team={REPL_BAT_SLOTS.get(pos,'?')})")
    print(f"  ATC SP {repl_pit_by_system['atc']['SP']:+.3f}  "
          f"(slots/team={REPL_SP_SLOTS_PER_TEAM}  total={REPL_SP_SLOTS_PER_TEAM*num_teams})")
    print(f"  OOPSY SP {repl_pit_by_system['oopsy']['SP']:+.3f}  "
          f"(slots/team={REPL_SP_SLOTS_PER_TEAM}  total={REPL_SP_SLOTS_PER_TEAM*num_teams})")
    print(f"  ATC RP {repl_pit_by_system['atc']['RP']:+.3f}  "
          f"(slots/team={REPL_RP_SLOTS_PER_TEAM}  total={REPL_RP_SLOTS_PER_TEAM*num_teams})")
    print(f"  OOPSY RP {repl_pit_by_system['oopsy']['RP']:+.3f}  "
          f"(slots/team={REPL_RP_SLOTS_PER_TEAM}  total={REPL_RP_SLOTS_PER_TEAM*num_teams})")

    print("\n[5/6] Building rankings (ATC/BATX + OOPSY)...")
    batx_batters  = build_batters(BATX_BATTERS,  unavail_idx, rfa_norm, pos_map, pos_by_name_team,
                                  hit_budget, "batx",  pos_by_last,
                                  replacement_levels=repl_bat_by_system["batx"],
                                  rfa_matcher=rfa_matcher)
    oopsy_batters = build_batters(OOPSY_BATTERS, unavail_idx, rfa_norm, pos_map, pos_by_name_team,
                                  hit_budget, "oopsy", pos_by_last,
                                  replacement_levels=repl_bat_by_system["oopsy"],
                                  rfa_matcher=rfa_matcher)
    # Cross-join ATC vol data onto BATX batters (primary system); OOPSY batters use est only
    atc_bat_vol_matcher = load_atc_batter_vol(ATC_BATTERS)
    batx_batters = apply_atc_vol_to_batters(batx_batters, atc_bat_vol_matcher)
    batx_batters = compute_vol_fields(batx_batters)
    print(f"  Batters: {len(batx_batters)} BATX / {len(oopsy_batters)} OOPSY")

    atc_sp   = build_sp(ATC_SP,   unavail_idx, rfa_norm, pos_map, pos_by_name_team,
                        sp_budget, "atc",   pos_by_last,
                        replacement_level=repl_pit_by_system["atc"]["SP"],
                        rfa_matcher=rfa_matcher)
    atc_sp = compute_vol_fields(atc_sp)
    oopsy_sp = build_sp(OOPSY_SP, unavail_idx, rfa_norm, pos_map, pos_by_name_team,
                        sp_budget, "oopsy", pos_by_last,
                        replacement_level=repl_pit_by_system["oopsy"]["SP"],
                        rfa_matcher=rfa_matcher)
    print(f"  SP:      {len(atc_sp)} ATC / {len(oopsy_sp)} OOPSY")

    atc_rp   = build_rp(ATC_RP,   unavail_idx, rfa_norm, pos_map, pos_by_name_team,
                        rp_budget, "atc",   pos_by_last,
                        replacement_level=repl_pit_by_system["atc"]["RP"],
                        rfa_matcher=rfa_matcher)
    atc_rp = compute_vol_fields(atc_rp)
    oopsy_rp = build_rp(OOPSY_RP, unavail_idx, rfa_norm, pos_map, pos_by_name_team,
                        rp_budget, "oopsy", pos_by_last,
                        replacement_level=repl_pit_by_system["oopsy"]["RP"],
                        rfa_matcher=rfa_matcher)
    print(f"  RP:      {len(atc_rp)} ATC / {len(oopsy_rp)} OOPSY")

    print("\n[6/7] Loading player notes + PL rankings + Athletic SP + tags...")
    notes_index, manual_notes = load_player_notes(PLAYER_NOTES)
    pl_index     = load_pl_batters(PL_BATTERS)
    pl_sp_index  = load_pl_sp(PL_SP)
    pl_rp_index  = load_pl_rp(PL_RP)
    athl_sp_index = load_athletic_sp(ATHLETIC_SP)

    print("\n[7/7] Merging + writing ldb_data.js...")
    batters = merge_rankings(batx_batters, oopsy_batters)
    sp      = merge_rankings(atc_sp,       oopsy_sp)
    rp      = merge_rankings(atc_rp,       oopsy_rp)

    batters = apply_notes(batters, notes_index, manual_notes, "batters")
    sp      = apply_notes(sp,      notes_index, manual_notes, "sp")
    rp      = apply_notes(rp,      notes_index, manual_notes, "rp")

    # PL enrichment
    batters = apply_pl_batters(batters, pl_index)
    sp      = apply_pl_sp(sp, pl_sp_index)
    rp      = apply_pl_rp(rp, pl_rp_index)

    # Athletic SP enrichment
    sp = apply_athletic_sp(sp, athl_sp_index)

    marginal_auction_values = build_owned_marginal_auction_values(
        board, pos_map, pos_by_name_team, pos_by_last, unavail_idx,
        repl_bat_by_system, repl_pit_by_system, hit_budget, sp_budget, rp_budget
    )

    team_vorp, owned_vorp_by_name, aa_detail_by_team = build_team_vorp_context(
        board, repl_bat_by_system, repl_pit_by_system, pos_map, pos_by_name_team, pos_by_last
    )

    # Build owned roster per team (for league board)
    roster_by_team = {abbr: [] for abbr in teams}
    for name, info in board["owned"].items():
        t = info["team"]
        if t in roster_by_team:
            roster_by_team[t].append({
                "name": name, "salary": info["salary"],
                "contract": info["contract"], "pos": info["pos"],
                "positions": get_positions(name, pos_map, pos_by_name_team, pos_by_last=pos_by_last),
                "theoretical_value": lookup_theoretical_value(name, theoretical_values, tv_by_last),
                "marginal_auction_value": marginal_auction_values.get(name),
                "keeper_vorp": owned_vorp_by_name.get(name, 0.0),
            })

    pos_slots = {pos: slots * num_teams for pos, slots in POS_SLOTS_PER_TEAM.items()}
    data = {
        "generated_at": str(date.today()),
        "meta": {
            "total_budget": round(total_budget, 2),
            "hit_budget":   round(hit_budget, 2),
            "sp_budget":    round(sp_budget, 2),
            "rp_budget":    round(rp_budget, 2),
            "min_pa": MIN_PA, "min_gs": MIN_GS, "min_ip": MIN_IP,
            "pos_slots_total": pos_slots,
            "ratio_model": {
                "season_weeks": SEASON_WEEKS,
                "team_weekly_ab": TEAM_WEEKLY_AB,
                "team_weekly_ip": TEAM_WEEKLY_IP,
                "notes": "OBP/OPS/ERA/WHIP scored by weekly ratio movement vs team baseline; RP counting categories scaled by RP IP/week vs SP reference IP/week.",
            },
        },
        "replacement_levels": {
            # Backward-compatible defaults for the primary systems shown in the UI.
            "bat": {pos: round(v, 3) for pos, v in repl_bat_by_system["batx"].items()},
            "sp":  round(repl_pit_by_system["atc"]["SP"], 3),
            "rp":  round(repl_pit_by_system["atc"]["RP"], 3),
            # System-specific baselines used to compute each projection system's VORP.
            "systems": {
                "batx": {
                    "bat": {pos: round(v, 3) for pos, v in repl_bat_by_system["batx"].items()},
                    "sp":  round(repl_pit_by_system["atc"]["SP"], 3),
                    "rp":  round(repl_pit_by_system["atc"]["RP"], 3),
                },
                "oopsy": {
                    "bat": {pos: round(v, 3) for pos, v in repl_bat_by_system["oopsy"].items()},
                    "sp":  round(repl_pit_by_system["oopsy"]["SP"], 3),
                    "rp":  round(repl_pit_by_system["oopsy"]["RP"], 3),
                },
            },
            "config": {
                "bat_slots_per_team": REPL_BAT_SLOTS,
                "sp_slots_per_team":  REPL_SP_SLOTS_PER_TEAM,
                "rp_slots_per_team":  REPL_RP_SLOTS_PER_TEAM,
                "bench_pct":          REPL_BENCH_PCT,
                "top_n":              REPL_TOP_N,
            },
        },
        "teams": teams,
        "roster_by_team": roster_by_team,
        "theoretical_values": theoretical_values,
        "rfa": {p: t for p, t in rfa_norm.items()},
        "aa_names": board["aa_names"],
        "batters": batters,
        "sp": sp,
        "rp": rp,
        "fry_keepers": FRY_KEEPERS,
    }

    OUTPUT_JS.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write("// AUTO-GENERATED by generate_data.py -- do not edit manually\n")
        f.write(f"// Generated: {data['generated_at']}\n\n")
        f.write("export const LDB_DATA = ")
        f.write(json.dumps(data, indent=2, ensure_ascii=False))
        f.write(";\n")

    print(f"  [OK] Written to {OUTPUT_JS}")
    write_auction_preview_md(board, roster_by_team, team_vorp, aa_detail_by_team, rfa_by_team)
    print(f"\n-- TOP 5 BATTERS (BATX, VORP-based) --")
    for p in batters[:5]:
        oopsy = f"OOPSY #{p.get('oopsy_rank','-')}" if p.get('oopsy_rank') else "no OOPSY match"
        rl = p.get("repl_level", 0)
        print(f"  #{p['rank']:<3} {p['name']:<25} ${p['est_value']}M  repl={rl:+.3f}  {oopsy}")
    print(f"\n-- TOP 5 SP (ATC, VORP-based) -- repl={repl_pit_by_system['atc']['SP']:+.3f}")
    for p in sp[:5]:
        oopsy = f"OOPSY #{p.get('oopsy_rank','-')}" if p.get('oopsy_rank') else "no OOPSY match"
        print(f"  #{p['rank']:<3} {p['name']:<25} ${p['est_value']}M  {oopsy}")
    print(f"\n-- TOP 5 RP (ATC, VORP-based) -- repl={repl_pit_by_system['atc']['RP']:+.3f}")
    for p in rp[:5]:
        oopsy = f"OOPSY #{p.get('oopsy_rank','-')}" if p.get('oopsy_rank') else "no OOPSY match"
        print(f"  #{p['rank']:<3} {p['name']:<25} ${p['est_value']}M  {oopsy}")
    print("\nDone!")

if __name__ == "__main__":
    main()
