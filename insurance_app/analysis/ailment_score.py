# pip install pandas numpy
import re
import json
import numpy as np
import pandas as pd

# ---------------------------
# 1) Ailment extraction (from your client JSON)
# ---------------------------
AilmentKeywords = {
    "cardiac":  ["cardiac", "heart", "cardio"],
    "cancer":   ["cancer", "onco", "tumor", "tumour"],
    "diabetes": ["diabetes", "diabetic"],
    "renal":    ["renal", "kidney"],
    "liver":    ["liver", "hepati"],
    "neuro":    ["neuro", "stroke", "brain"],
}

def _normalize_ailment_name(s: str) -> str | None:
    if not s:
        return None
    s = s.lower()
    for k, kws in AilmentKeywords.items():
        if any(kw in s for kw in kws):
            return k
    return s.strip() or None

def extract_member_ailments(client: dict) -> dict[str, list[str]]:
    """Returns a dict mapping member name to their unique normalized ailments."""
    member_ailments = {}

    # Primary applicant
    applicant_name = client.get("primaryContact", {}).get("applicant_name", "Self")
    self_ailments = []
    for d in client.get("healthHistory", {}).get("disease", []) or []:
        a = _normalize_ailment_name(d)
        if a and a not in self_ailments: self_ailments.append(a)
    if self_ailments:
        member_ailments[applicant_name] = self_ailments

    # Other members
    for member in client.get("members", []) or []:
        member_name = member.get("name", "UnknownMember")
        ailments = []
        for k in (member.get("healthHistory", {}) or {}).keys():
            a = _normalize_ailment_name(k)
            if a and a not in ailments: ailments.append(a)
        if ailments:
            member_ailments[member_name] = ailments
            
    return member_ailments

# ---------------------------
# 2) Plan → ailment capability heuristics (no external data)
# ---------------------------
def plan_support_for_ailment(plan_row: pd.Series, ailment: str) -> float:
    """
    Heuristic: 
      1.0 if plan looks ailment-specific,
      0.8 if comprehensive,
      0.6 generic,
      0.5 if plan category seems specific to a *different* ailment.
    """
    name  = str(plan_row.get("Plan Name", "")).lower()
    cat   = str(plan_row.get("Category", "")).lower()
    dcode = str(plan_row.get("Disease Code", "")).lower()

    kws = AilmentKeywords.get(ailment, [])
    is_comprehensive = ("comprehensive" in cat) or ("comprehensive" in name)
    specific_match = any(kw in name or kw in cat for kw in kws)
    dcode_match = any(kw in dcode for kw in kws) if dcode else False

    if specific_match or dcode_match:
        return 1.0
    if is_comprehensive:
        return 0.8
    # if plan is specific to some other disease (e.g., "Diabetes" category but ailment is cardiac)
    if cat and (ailment not in cat):
        # if the category itself contains any other-known ailment keyword, penalize a bit
        if any(any(kw in cat for kw in v) for k, v in AilmentKeywords.items() if k != ailment):
            return 0.5
    return 0.6


# ---------------------------
# 3) Deterministic precedence scoring (only using columns present in your plans DF)
# ---------------------------

# Row weights (sum to 100). Keep lexicographic veto logic in your app if needed.
ROW_WEIGHTS = {1:20, 2:10, 3:18, 4:12, 5:12, 6:8, 7:8, 8:6, 9:4, 10:2}
WITHIN_ROW = [0.55, 0.25, 0.15, 0.05]  # left→right importance

# Map precedence rows → the plan-CSV columns you actually have.
# (Skip rows/cols that don’t exist in your CSV.)
DEFAULT_PRECEDENCE_TO_CSV = {
    2: ["Adult Min Entry Age", "Adult Max Entry Age", "Child Min Entry Age", "Child Max Entry Age"],
    3: ["AilmentScore"],  # injected by this code
    4: ["In-Patient", "Day-Care", "AYUSH", "Modern Tx"],
    5: ["Co-payment (%)", "top_up"],
    9: ["Maternity", "desired_opd"],
}

def _normalize_copay(x) -> float:
    # 0 → 1.0, <=10 → 0.7, <=20 → 0.4, else 0.1, NaN → 0.5
    try:
        if pd.isna(x): return 0.5
        x = float(x)
        if x == 0: return 1.0
        if x <= 10: return 0.7
        if x <= 20: return 0.4
        return 0.1
    except Exception:
        return 0.5

def _normalize_binary(x) -> float:
    return 1.0 if x == 1 else 0.0

def _normalize_age(value, favor_max=True) -> float:
    # If NaN → neutral 0.5; scale ~ [0,1] with simple cap at 100
    if pd.isna(value): return 0.5
    try:
        v = float(value)
    except Exception:
        return 0.5
    cap = 100.0
    if favor_max:
        return max(0.0, min(1.0, v / cap))          # higher max age is better
    else:
        return max(0.0, min(1.0, 1.0 - (v / cap)))  # lower min age is better

def _within_row_weights(n: int) -> list[float]:
    ws = WITHIN_ROW[:max(1, n)]
    s = sum(ws)
    return [w / s for w in ws]

def score_row(plan_row: pd.Series, cols: list[str]) -> float:
    if not cols: 
        return 0.0
    ws = _within_row_weights(len(cols))
    row_score = 0.0
    for i, col in enumerate(cols):
        if col not in plan_row.index:
            # missing column → neutral
            s = 0.5
        else:
            val = plan_row[col]
            if col == "Co-payment (%)":
                s = _normalize_copay(val)
            elif col in ["top_up", "In-Patient", "Day-Care", "AYUSH", "Modern Tx", "Maternity", "desired_opd"]:
                s = _normalize_binary(val)
            elif col in ["Adult Min Entry Age", "Child Min Entry Age"]:
                s = _normalize_age(val, favor_max=False)
            elif col in ["Adult Max Entry Age", "Child Max Entry Age"]:
                s = _normalize_age(val, favor_max=True)
            elif col == "AilmentScore":
                try:
                    s = float(val)
                except Exception:
                    s = 0.5
            else:
                s = 0.5  # safe neutral for unhandled types
        row_score += ws[i] * s
    return row_score

def compute_member_aware_scores(
    plans_df: pd.DataFrame,
    client: dict,
    precedence_to_csv: dict[int, list[str]] = None,
    row_weights: dict[int, float] = None
) -> pd.DataFrame:
    """
    Adds two columns to a copy of plans_df:
      - AilmentScore (0..1)
      - Score_MemberAware (0..100 scale, given the row weights)
    Returns a sorted DataFrame by Score_MemberAware (desc).
    """
    precedence_to_csv = precedence_to_csv or DEFAULT_PRECEDENCE_TO_CSV
    row_weights = row_weights or ROW_WEIGHTS

    # 1) extract ailments per member
    member_ailments = extract_member_ailments(client)

    # 2) compute ailment scores per member
    df = plans_df.copy()
    # Standardize the Plan Name column to avoid KeyErrors
    if 'Plan_Name' in df.columns and 'Plan Name' not in df.columns:
        df.rename(columns={'Plan_Name': 'Plan Name'}, inplace=True)
    member_score_cols = []
    for member_name, ailments in member_ailments.items():
        col_name = f"Score_{member_name}"
        # Calculate the mean support for this member's ailments
        df[col_name] = df.apply(lambda r: np.mean([plan_support_for_ailment(r, a) for a in ailments]), axis=1)
        member_score_cols.append(col_name)

    # The overall AilmentScore is the mean of all member-specific scores
    if member_score_cols:
        df["AilmentScore"] = df[member_score_cols].mean(axis=1)
    else:
        df["AilmentScore"] = 1.0 # Default for a healthy household

    # 3) compute total score per plan
    total_scores = []
    for _, r in df.iterrows():
        total = 0.0
        for prec_row, cols in precedence_to_csv.items():
            if not cols: 
                continue
            rs = score_row(r, cols)
            total += rs * row_weights.get(prec_row, 0.0)
        total_scores.append(total)
    df["Score_MemberAware"] = total_scores

    # Ensure essential columns are present for the dashboard
    # Ensure essential columns are present for the dashboard
    final_cols = list(set([
        "Plan Name", "Category", "AilmentScore"
    ] + member_score_cols + ["Score_MemberAware"]))
    
    return df[[c for c in final_cols if c in df.columns]]

# ---------------------------
# Example usage
# ---------------------------
# plans = pd.read_csv("Derived_features.csv")
# client = json.loads(open("client.json").read())
# ranked = compute_member_aware_scores(plans, client)
# ranked.to_csv("member_aware_ranked_plans.csv", index=False)
