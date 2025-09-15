from collections import Counter, defaultdict
from itertools import chain, combinations
import json
from datetime import datetime
import pandas as pd

def bundle_plans_by_score(initial_plans: dict, ranked_plans_df: pd.DataFrame, family_structure: dict) -> dict:
    """
    Creates Option 1 and Option 2 bundles based on pre-scored plans.

    Args:
        initial_plans: The output of fetch_plans, showing which plans were suggested for each member.
        ranked_plans_df: A DataFrame of all unique plans with their calculated scores.

    Returns:
        A dictionary containing the structured plan options.
    """
    plan_sets = {k: set(v['plans']) for k, v in initial_plans.items() if v.get('plans')}
    names = {k: v.get('name', k) for k, v in initial_plans.items()}
    all_member_names = sorted(list(names.values()))

    # Create a lookup for plan scores
    score_lookup = ranked_plans_df.set_index('Plan Name')['Score_MemberAware'].to_dict()

    # --- Option 1: Full Family Floater --- #
    # Use the 'Family Floater' category directly from the ranked plans.
    # These have already been validated to cover the whole family in the analysis blueprint.
    family_floater_df = ranked_plans_df[ranked_plans_df['Category'] == 'Family Floater']
    
    # Sort these plans by their score and get the full plan objects
    sorted_full_family_plans_df = family_floater_df.sort_values(by='Score_MemberAware', ascending=False)

    option_1_full_family_plans = {
        "covered_members": all_member_names,
        "plans": sorted_full_family_plans_df.to_dict(orient='records')
    }

    # --- Option 2: Best Individual Plan Combination --- #
    individual_plans_df = ranked_plans_df[ranked_plans_df['Category'] == 'Individual']
    
    best_individual_combo = []
    all_members_covered = True

    for key, p_set in plan_sets.items():
        member_name = names[key]
        # Find the highest-scoring individual plan recommended for this member
        member_specific_individual_plans = individual_plans_df[individual_plans_df['Plan Name'].isin(p_set)]
        
        if not member_specific_individual_plans.empty:
            top_plan = member_specific_individual_plans.sort_values(by='Score_MemberAware', ascending=False).iloc[0]
            best_individual_combo.append({
                "member": member_name,
                "plan": top_plan['Plan Name'],
                "score": top_plan['Score_MemberAware']
            })
        else:
            # If a member has no suitable individual plan, this combo is not possible
            all_members_covered = False
            break  # Exit the loop early

    option_2_best_individual_combo = {}
    if all_members_covered and best_individual_combo:
        total_score = sum(p['score'] for p in best_individual_combo)
        option_2_best_individual_combo = {
            "plans": best_individual_combo,
            "total_score": total_score
        }

    # For providing a browsable list of individual plans per member
    individual_plans_per_member = {}
    for key, p_set in plan_sets.items():
        member_specific_individual_plans = individual_plans_df[individual_plans_df['Plan Name'].isin(p_set)]
        sorted_plans = member_specific_individual_plans.sort_values(by='Score_MemberAware', ascending=False)['Plan Name'].tolist()
        individual_plans_per_member[names[key]] = sorted_plans

    option_2_combination_plans = {
        "best_individual_combo": option_2_best_individual_combo,
        "individual_plans_per_member": individual_plans_per_member,
        "hybrid_combos": _generate_hybrid_combinations(plan_sets, ranked_plans_df, names)
    }

    return {
        "option_1_full_family_plans": option_1_full_family_plans,
        "option_2_combination_plans": option_2_combination_plans
    }

def _generate_hybrid_combinations(plan_sets: dict, ranked_plans_df: pd.DataFrame, names: dict) -> list:
    """
    Generates and ranks hybrid combinations of floater and individual plans.

    A hybrid combination consists of one floater plan covering a subgroup of the family,
    and individual plans for all remaining members.
    """
    all_member_keys = list(plan_sets.keys())
    if len(all_member_keys) < 2:
        return []

    family_floater_df = ranked_plans_df[ranked_plans_df['Category'] == 'Family Floater']
    individual_plans_df = ranked_plans_df[ranked_plans_df['Category'] == 'Individual']
    
    hybrid_options = []

    # Iterate through all possible subgroup sizes for the floater, from 2 up to all-but-one member
    for i in range(2, len(all_member_keys)):
        for combo_keys in combinations(all_member_keys, i):
            # 1. Find the best floater for this subgroup
            subgroup_plan_sets = [plan_sets[k] for k in combo_keys]
            subgroup_intersection = set.intersection(*subgroup_plan_sets)
            
            valid_floater_df = family_floater_df[family_floater_df['Plan Name'].isin(subgroup_intersection)]
            
            if valid_floater_df.empty:
                continue

            best_subgroup_floater = valid_floater_df.sort_values(by='Score_MemberAware', ascending=False).iloc[0]
            
            # 2. Cover the remaining members with individual plans
            remaining_keys = set(all_member_keys) - set(combo_keys)
            
            combo_package = [{
                "type": "Floater",
                "plan": best_subgroup_floater['Plan Name'],
                "covered_members": sorted([names[k] for k in combo_keys]),
                "score": best_subgroup_floater['Score_MemberAware']
            }]
            
            total_score = best_subgroup_floater['Score_MemberAware']
            all_remaining_covered = True

            for rem_key in remaining_keys:
                member_name = names[rem_key]
                rem_plan_set = plan_sets[rem_key]
                
                member_individual_plans = individual_plans_df[individual_plans_df['Plan Name'].isin(rem_plan_set)]
                
                if member_individual_plans.empty:
                    all_remaining_covered = False
                    break
                
                best_individual_plan = member_individual_plans.sort_values(by='Score_MemberAware', ascending=False).iloc[0]
                
                combo_package.append({
                    "type": "Individual",
                    "plan": best_individual_plan['Plan Name'],
                    "covered_members": [member_name],
                    "score": best_individual_plan['Score_MemberAware']
                })
                total_score += best_individual_plan['Score_MemberAware']

            # 3. If all members are covered, add it to our list of options
            if all_remaining_covered:
                hybrid_options.append({
                    "package": combo_package,
                    "total_score": total_score
                })

    # Sort the collected hybrid options by their total score
    return sorted(hybrid_options, key=lambda x: x['total_score'], reverse=True)

def analyze_plan_intersections(plans_data: dict) -> dict:
    """
    Analyzes insurance plan data to find common plans and intersections among members.

    Args:
        plans_data: A dictionary where keys are member/cover identifiers and
                    values are dicts containing a list of 'plans'.
                    Example: {'member1': {'plans': ['A', 'B']}, 'comprehensive': {'plans': ['B', 'C']}}

    Returns:
        A dictionary containing two keys:
        - 'ranked_by_commonality': A list of plans sorted by how many members they cover.
        - 'intersections': A dictionary showing which plans cover various combinations of members.
    """
    # Prepare data, filtering out entries without plans and getting names
    valid_entries = {k: v for k, v in plans_data.items() if v.get('plans')}
    plan_sets = {k: set(v['plans']) for k, v in valid_entries.items()}
    
    # Use a more descriptive name if available, otherwise use the key
    names = {k: v.get('name', k) for k, v in valid_entries.items()}

    # 1. Count Plan Occurrences (Commonality Score)
    all_plans_flat = list(chain.from_iterable(plan_sets.values()))
    if not all_plans_flat:
        return {"ranked_by_commonality": [], "intersections": {}}

    plan_counts = Counter(all_plans_flat)

    # Map each plan to the members it covers
    plan_to_members = {plan: [] for plan in plan_counts}
    for key, p_set in plan_sets.items():
        for plan in p_set:
            plan_to_members[plan].append(names[key])

    ranked_by_commonality = [
        {
            "plan": plan,
            "commonality_score": count,
            "covered_members": sorted(plan_to_members[plan])
        }
        for plan, count in plan_counts.most_common()
    ]

    # 2. Structure plans into Option 1 (Full Family) and Option 2 (Combinations)
    option_1_full_family_plans = {}
    option_2_combination_plans = {
        "individual_plans": {names[k]: sorted(list(v)) for k, v in plan_sets.items()},
        "combo_plans": {}
    }

    keys = list(plan_sets.keys())
    all_member_names = sorted(list(names.values()))

    # Calculate intersections for all combinations from 2 members up to all members
    for i in range(2, len(keys) + 1):
        for combo_keys in combinations(keys, i):
            combo_plan_sets = [plan_sets[k] for k in combo_keys]
            combo_intersection = sorted(list(set.intersection(*combo_plan_sets)))

            if combo_intersection:
                combo_names = sorted([names[k] for k in combo_keys])
                
                # If the combo includes all members, it's Option 1
                if len(combo_keys) == len(keys):
                    option_1_full_family_plans = {
                        "covered_members": all_member_names,
                        "plans": combo_intersection
                    }
                # Otherwise, it's part of Option 2
                else:
                    intersection_key = " & ".join(combo_names)
                    option_2_combination_plans["combo_plans"][intersection_key] = combo_intersection

    # Save the results to a timestamped JSON file
    results_to_save = {
        "option_1_full_family_plans": option_1_full_family_plans,
        "option_2_combination_plans": option_2_combination_plans,
        "ranked_by_commonality": ranked_by_commonality
    }

    # Debug printing
    print('*' * 50)
    print(json.dumps(results_to_save, indent=2))
    print('*' * 50)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"analysis_results_{timestamp}.json"
    with open(filename, 'w') as f:
        json.dump(results_to_save, f, indent=4)
    print(f"Analysis results saved to {filename}")

    return results_to_save
