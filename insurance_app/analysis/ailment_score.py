import os
import json
import re
from copy import deepcopy

import numpy as np
import pandas as pd

# ---------------------------

# ---------------------------
# 2) Plan → ailment capability heuristics (no external data)
# ---------------------------
def plan_support_for_ailment(plan_row: pd.Series, ailment_code: str, config: dict) -> float:
    """Calculates a score based on the user's explicit flowchart logic."""
    plan_dcode = str(plan_row.get("Disease_Code", "")).strip().upper()
    scores = config.get('ailment_support_scores', {})

    # 1. Direct Match
    if ailment_code == plan_dcode:
        return scores.get('direct_match_score', 1.0)

    # 2. Plan supports MULTI
    if plan_dcode == 'MULTI':
        return scores.get('multi_disease_score', 0.8)

    # 3. Plan supports GENERAL (or is empty/NaN)
    if plan_dcode == 'GENERAL' or not plan_dcode or plan_dcode == 'NAN':
        return scores.get('general_plan_score', 0.6)

    # 4. Plan is for a different, specific disease
    return scores.get('mismatched_disease_score', 0.0)


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
    3: ["AilmentScore"],  
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
    """Return a weight vector of length n.
    If n <= len(WITHIN_ROW), use the predefined template slice.
    If n > len(WITHIN_ROW), fall back to equal weights.
    """
    n = max(1, int(n))
    if n <= len(WITHIN_ROW):
        ws = WITHIN_ROW[:n]
    else:
        ws = [1.0 / n] * n
    s = sum(ws) or 1.0
    return [w / s for w in ws]


def compute_member_aware_scores(plans_df: pd.DataFrame, derived_features: dict, app, precedence_to_csv: dict[int, list[str]] = None, row_weights: dict[int, float] = None) -> pd.DataFrame:
    """
    Adds two columns to a copy of plans_df:
      - AilmentScore (0..1)
      - Score_MemberAware (0..100 scale, given the row weights)
    Returns a sorted DataFrame by Score_MemberAware (desc).
    """
    precedence_to_csv = precedence_to_csv or DEFAULT_PRECEDENCE_TO_CSV
    row_weights = row_weights or ROW_WEIGHTS

    df = plans_df.copy()

    # Load configuration once at the top
    config_path = os.path.join(app.root_path, 'select_plans_config.json')
    with open(config_path, 'r') as f:
        scoring_config = json.load(f)

    # 1) Extract ailments for each member from the derived_features
    member_ailments = {}
    for member_key, member_data in derived_features.items():
        if isinstance(member_data, dict) and 'name' in member_data:
            member_name = member_data['name']
            disease_codes_str = member_data.get('disease_code', 'GENERAL')
            if disease_codes_str and isinstance(disease_codes_str, str):
                codes = [code.strip().upper() for code in disease_codes_str.split(',')]
                member_ailments[member_name] = [code for code in codes if code and code != 'GENERAL']
            else:
                member_ailments[member_name] = []

    # 2) compute ailment scores per member
    # Standardize the Plan Name column to avoid KeyErrors
    if 'Plan_Name' in df.columns and 'Plan Name' not in df.columns:
        df.rename(columns={'Plan_Name': 'Plan Name'}, inplace=True)
    member_score_cols = []
    for member_name, ailments in member_ailments.items():
        col_name = f"Score_{member_name}"

        # Calculate the mean support for this member's ailments
        # If the member has specific ailments, score the plan's support for them.
        if ailments:
            df[col_name] = df.apply(lambda r: np.mean([plan_support_for_ailment(r, ailment_code, scoring_config) for ailment_code in ailments]), axis=1)
        # If the member is healthy (no specific ailments), score the plan based on its general suitability.
        else:
            df[col_name] = df.apply(lambda r: plan_support_for_ailment(r, 'GENERAL', scoring_config), axis=1)
        member_score_cols.append(col_name)

    # The overall AilmentScore is the mean of all member-specific scores
    if member_score_cols:
        df["AilmentScore"] = df[member_score_cols].mean(axis=1)
    else:
        df["AilmentScore"] = 1.0 # Default for a healthy household

    # 3) Dynamically add member scores to the precedence calculation
    # This finds the precedence row containing 'AilmentScore' and adds all
    # generated 'Score_{MemberName}' columns to it, ensuring they are included
    # in the final weighted score.
    dynamic_precedence = deepcopy(precedence_to_csv)
    for row_num, cols in dynamic_precedence.items():
        if "AilmentScore" in cols:
            # Add member scores to the same row as the overall AilmentScore
            dynamic_precedence[row_num].extend(member_score_cols)
            break

    # 4) Pre-normalize special columns that require custom logic (e.g., Co-payment).
    # This converts their values to a standard 0-1 scale before the final calculation.
    if 'Co-payment (%)' in df.columns:
        df['normalized_copay'] = df['Co-payment (%)'].apply(_normalize_copay)
        # Update precedence to use the new normalized column
        for row, cols in precedence_to_csv.items():
            if 'Co-payment (%)' in cols:
                precedence_to_csv[row] = [c if c != 'Co-payment (%)' else 'normalized_copay' for c in cols]

    # 5) Calculate the final weighted score
    total_score = pd.Series(0.0, index=df.index)
    for row_num, cols in dynamic_precedence.items():
        w = row_weights.get(row_num, 0)
        existing_cols = [c for c in cols if c in df.columns]
        if w > 0 and existing_cols:
            # Correctly calculate the weighted sum for the row
            ws = _within_row_weights(len(existing_cols))
            row_score = (df[existing_cols] * ws).sum(axis=1)
            total_score += w * row_score
    df['Score_MemberAware'] = total_score

    return df.sort_values('Score_MemberAware', ascending=False)

# ---------------------------
# Example usage
# ---------------------------
# plans = pd.read_csv("Derived_features.csv")
# client = json.loads(open("client.json").read())
# ranked = compute_member_aware_scores(plans, client)
# ranked.to_csv("member_aware_ranked_plans.csv", index=False)
