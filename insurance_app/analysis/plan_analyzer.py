from collections import Counter, defaultdict
from itertools import chain, combinations
import json
from datetime import datetime
import pandas as pd


# Helper function to parse plan capacity from Policy_Code
def get_plan_capacity(policy_code):
    """Parses a Policy_Code (e.g., 'FLO_2_1') and returns a tuple of (adults, children)."""
    if pd.isna(policy_code) or not isinstance(policy_code, str):
        return (1, 0) # Default to 1 adult, 0 children for individual/missing
    parts = policy_code.strip().upper().split('_')
    # Check for standard floater format FLO_A_C or MIX_A_C
    if len(parts) == 3 and parts[0] in ('FLO', 'MIX') and parts[1].isdigit() and parts[2].isdigit():
        return (int(parts[1]), int(parts[2]))
    return (1, 0) # Default to individual for non-standard or disease-specific codes

def bundle_plans_by_score(initial_plans: dict, ranked_plans_df: pd.DataFrame, family_structure: dict) -> dict:
    """
    Creates Option 1 and Option 2 bundles based on pre-scored plans.

    Args:
        initial_plans: The output of fetch_plans, showing which plans were suggested for each member.
        ranked_plans_df: A DataFrame of all unique plans with their calculated scores.

    Returns:
        A dictionary containing the structured plan options.
    """
    # --- FINAL, CORRECT LOGIC --- #
    df = ranked_plans_df.copy()
    # --- New, more detailed capacity parsing ---
    capacity_df = df['Policy_Code'].apply(get_plan_capacity)
    df['Plan_Adults'] = capacity_df.apply(lambda x: x[0])
    df['Plan_Children'] = capacity_df.apply(lambda x: x[1])
    df['Plan_Capacity'] = df['Plan_Adults'] + df['Plan_Children']

    # 1. Identify Floaters vs. Combination Candidates directly from Policy_Code
    is_floater = df['Policy_Code'].str.upper().str.startswith(('FLO_', 'MIX_'), na=False)
    
    # 2. Generate "Best Floater" plans (Option 1) with multi-level sorting
    family_adults = family_structure.get('adults', 0)
    family_children = family_structure.get('children', 0)

    best_floaters_df = df[is_floater].copy()
    # Only consider floaters that can actually fit the family
    best_floaters_df = best_floaters_df[
        (best_floaters_df['Plan_Adults'] >= family_adults) & 
        (best_floaters_df['Plan_Children'] >= family_children)
    ]

    if not best_floaters_df.empty:
        best_floaters_df['Adult_Surplus'] = best_floaters_df['Plan_Adults'] - family_adults
        best_floaters_df['Child_Surplus'] = best_floaters_df['Plan_Children'] - family_children
        
        best_floaters_df = best_floaters_df.sort_values(
            by=['AilmentScore', 'Adult_Surplus', 'Child_Surplus'],
            ascending=[False, True, True]
        )
    # Clean for JSON serialization before converting
    safe_best_floaters_df = best_floaters_df.where(pd.notnull(best_floaters_df), None)
    option_1_full_family_plans = {
        "covered_members": ["Entire Family"],
        "plans": safe_best_floaters_df.to_dict(orient='records')
    }

    # 3. Generate Hybrid Combination Packages (Option 2)
    member_ailments = family_structure.get('member_ailments', {})
    member_ages = family_structure.get('member_ages', {})
    adult_age_threshold = 25 # This could be moved to a config file

    high_need_members = {name: ailments for name, ailments in member_ailments.items() if ailments}
    general_members = [name for name, ailments in member_ailments.items() if not ailments]

    # Part A: Find all suitable individual plans for each high-need member
    top_plans_for_high_need = {}
    if high_need_members:
        individual_plans_df = df[~is_floater].copy()
        for member_name in high_need_members:
            score_col = f'Score_{member_name}'
            if score_col in individual_plans_df.columns:
                member_specific_plans = individual_plans_df[individual_plans_df[score_col] > 0]
                if not member_specific_plans.empty:
                    # Clean for JSON serialization before converting
                    safe_member_specific_plans = member_specific_plans.where(pd.notnull(member_specific_plans), None)
                    top_plans_for_high_need[member_name] = safe_member_specific_plans.sort_values(by=score_col, ascending=False).to_dict(orient='records')

    # Part B: Find the single best small floater for the general members group
    best_floater_for_general = None
    if general_members:
        num_general_adults = sum(1 for m in general_members if member_ages.get(m, 0) >= adult_age_threshold)
        num_general_children = len(general_members) - num_general_adults
        
        if num_general_adults > 0 or num_general_children > 0:
            general_group_floaters = df[is_floater].copy()
            fittable_floaters = general_group_floaters[
                (general_group_floaters['Plan_Adults'] >= num_general_adults) & 
                (general_group_floaters['Plan_Children'] >= num_general_children)
            ]
            if not fittable_floaters.empty:
                fittable_floaters['Adult_Surplus'] = fittable_floaters['Plan_Adults'] - num_general_adults
                fittable_floaters['Child_Surplus'] = fittable_floaters['Plan_Children'] - num_general_children
                # Clean for JSON serialization before converting
                safe_fittable_floaters = fittable_floaters.where(pd.notnull(fittable_floaters), None)
                best_floater_for_general = safe_fittable_floaters.sort_values(
                    by=['Adult_Surplus', 'Child_Surplus', 'AilmentScore'], ascending=[True, True, False]
                ).iloc[0].to_dict()

    # Part C: Generate and rank all hybrid combinations
    combination_packages = []
    # Only proceed if we can cover all high-need members
    if top_plans_for_high_need and len(top_plans_for_high_need) == len(high_need_members):
        from itertools import product
        high_need_plan_lists = list(top_plans_for_high_need.values())
        high_need_names = list(top_plans_for_high_need.keys())
        plan_combinations = product(*high_need_plan_lists)

        for i, combo in enumerate(plan_combinations):
            package_plans = []
            total_score = 0
            # Add individual plans for high-need members
            for j, plan_details in enumerate(combo):
                member_name = high_need_names[j]
                score_col = f'Score_{member_name}'
                package_plans.append({
                    "members": [member_name],
                    "plan_name": plan_details['Plan Name'],
                    "score": plan_details[score_col]
                })
                total_score += plan_details[score_col]
            
            # Add the floater for the general members, if one was found
            if best_floater_for_general:
                package_plans.append({
                    "members": general_members,
                    "plan_name": best_floater_for_general['Plan Name'],
                    "score": best_floater_for_general['AilmentScore']
                })
                total_score += best_floater_for_general['AilmentScore']
            # If there are general members but no floater was found, this package is incomplete
            elif general_members:
                continue # Skip this incomplete package

            combination_packages.append({
                "package_rank": i + 1, # Will be re-ranked by score
                "plans": package_plans,
                "total_score": total_score
            })

    option_2_combination_plans = {
        "ranked_packages": sorted(combination_packages, key=lambda x: x['total_score'], reverse=True)
    }

    # --- Terminal Printing for Debugging --- #
    # Define the column order for printing
    all_score_cols = sorted([col for col in df.columns if col.startswith('Score_') and col != 'AilmentScore'])
    member_score_cols = [col for col in all_score_cols if col != 'Score_MemberAware']

    # --- Essential Table (All Scored Plans) --- #
    print("\n--- Essential Table (Sorted by Ailment Score) ---")
    total_family_members = family_structure.get('adults', 0) + family_structure.get('children', 0)
    
    # Note: Family_Fit is already calculated in the blueprint, so we don't need to recalculate it here.
    essential_table_df = df.sort_values(by='AilmentScore', ascending=False)
    
    # Explicitly define the column order as requested
    essential_cols = ['Plan Name', 'Family_Fit', 'AilmentScore'] + all_score_cols
    display_cols = [col for col in essential_cols if col in essential_table_df.columns]
    print(f"Client Family Size: {total_family_members}")
    print(essential_table_df[display_cols].to_string())
    print("--- --- --- ---")

    print("\n--- Best Floater Plans ---")
    if not best_floaters_df.empty:
        print(best_floaters_df[['Plan Name', 'AilmentScore']].to_string(index=False))
    else:
        print("No suitable floater plans found.")
    print("--- --- --- ---")

    print("\n--- Best Combination Packages ---")
    if option_2_combination_plans.get('ranked_packages'):
        for i, package in enumerate(option_2_combination_plans['ranked_packages']):
            print(f"\n--- Package #{i+1} (Total Score: {package['total_score']:.2f}) ---")
            package_df = pd.DataFrame(package['plans'])
            print(package_df.to_string(index=False))
    else:
        print("No combination packages could be generated.")
    print("--- --- --- ---")
    # --- End of Final Logic --- #

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
