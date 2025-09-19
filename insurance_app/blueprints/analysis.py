import json
import pandas as pd
from itertools import chain
from flask import Blueprint, jsonify, render_template, current_app
from ..database import get_db_connection, get_derived_db_connection
from ..analysis.get_plans import fetch_plans
from ..analysis.plan_analyzer import bundle_plans_by_score, analyze_plan_intersections
from ..analysis.ailment_score import compute_member_aware_scores
from ..analysis.query_fetcher import generate, clean_and_parse

analysis_bp = Blueprint('analysis_bp', __name__)

def categorize_plan(policy_code):
    """Categorizes a plan based on its policy code using prefix-based rules."""
    if pd.isna(policy_code) or not isinstance(policy_code, str):
        return 'Unknown'

    code = policy_code.strip().upper()

    # Primary categorization based on prefixes
    if code.startswith('FLO_') or code.startswith('MIX_'):
        return 'Family Floater'
    if code.startswith('IND_'):
        return 'Individual'
    if code.startswith('ADN_'):
        return 'Add-on'


    # Fallback for disease-specific codes (e.g., CANCER) which are individual
    # This assumes codes without a clear floater/individual prefix are specialized individual plans.
    if '_' not in code and code.isalpha():
        return 'Individual'

    return 'Unknown'

# Helper function to validate plan based on family structure from Policy_Code
def is_plan_valid_for_family(policy_code, num_adults, num_children, logger):
    if pd.isna(policy_code) or not isinstance(policy_code, str) or not policy_code.strip():
        return True  # Assume valid if no code is specified

    code = policy_code.strip().upper()

    if code == 'ADN_NA_0':
        return True  # Add-on plan, always valid as it depends on a base plan

    # Total members in the family
    total_members = num_adults + num_children
    if total_members == 0:
        return False  # No plan is valid for an empty family

    # Handle special case MIX_1_1: One adult OR one child
    if code == 'MIX_1_1':
        return (num_adults == 1 and num_children == 0) or (num_adults == 0 and num_children == 1)

    parts = code.split('_')
    if len(parts) != 3:
        # Fallback for old codes like '1A', '2A1C', etc.
        if code == '1A': return num_adults == 1 and num_children == 0
        if code == '2A': return num_adults == 2 and num_children == 0
        if code == '1A1C': return num_adults == 1 and num_children >= 1
        if code in ['2A1C', '2A2C', '2A3C']: return num_adults == 2 and num_children >= 1
        logger.warning(f"Unrecognized Policy_Code format '{policy_code}'. Assuming it's a flexible plan.")
        return True

    plan_type, adult_part, child_part = parts

    try:
        # --- Parse Adult Limit ---
        if adult_part.isdigit():
            max_adults = int(adult_part)
        elif adult_part == 'SR' and plan_type == 'FLO': # FLO_Sr_2_0
            # Senior-specific logic can be added here if age definitions are provided.
            # For now, we treat it as a standard 2-adult plan.
            max_adults = 2
        else:
            raise ValueError(f"Invalid adult part: {adult_part}")

        # --- Parse Child Limit ---
        if child_part.isdigit():
            max_children = int(child_part)
            min_children = 0
        elif child_part == 'GT0':
            max_children = float('inf')
            min_children = 1
        else:
            raise ValueError(f"Invalid child part: {child_part}")

        # --- Validate against family structure ---
        if num_adults > max_adults:
            return False
        if num_children > max_children:
            return False
        if num_children < min_children:
            return False
        
        # For IND/FLO plans, the family composition must exactly match the plan's capacity
        if plan_type in ['IND', 'FLO']:
            # A floater plan must cover all members. If the family is larger than the plan, it's invalid.
            if total_members > (max_adults + (max_children if max_children != float('inf') else num_children)):
                 return False
            # An individual plan should only cover one person
            if plan_type == 'IND' and total_members > 1:
                return False

        return True

    except (ValueError, IndexError) as e:
        logger.error(f"Error parsing Policy_Code '{policy_code}': {e}")
        return True  # Assume valid on parsing error to avoid incorrectly filtering

@analysis_bp.route('/analyzed_plans', methods=['POST'])
def get_analyzed_plans(summary):
    if not summary:
        return jsonify({"error": "Invalid input"}), 400
    initial_plans = fetch_plans(summary)
    analyzed_data = analyze_plan_intersections(initial_plans)
    return jsonify(analyzed_data), 200

@analysis_bp.route('/proposed_plans/<unique_id>')
def get_proposed_plans(unique_id):
    conn = get_db_connection()
    row = conn.execute('SELECT form_summary, supervisor_approval_status FROM submissions WHERE unique_id = ?', (unique_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Submission not found.'}), 404
    
    client_data = json.loads(row['form_summary'])
    supervisor_status = row['supervisor_approval_status'] if 'supervisor_approval_status' in row.keys() else None
    current_app.logger.info(f"Step 1: Fetched client data for {unique_id}")

    derived_text = generate(json.dumps(client_data))
    derived_features = clean_and_parse(derived_text)
    current_app.logger.info(f"Step 2: Generated derived features.")

    initial_plans = fetch_plans(derived_features)
    current_app.logger.info(f"Step 3: Fetched initial plan recommendations: {initial_plans}")

    union_of_plans = set(chain.from_iterable(p['plans'] for p in initial_plans.values() if p.get('plans')))
    if not union_of_plans:
        return render_template('Analysis_Dashboard.html', unique_id=unique_id, client_data=client_data, analysis={'option_1_full_family_plans': {}, 'option_2_combination_plans': {'individual_plans': {}, 'combo_plans': {}}}, ranked_plans=[], supervisor_status=supervisor_status)
    current_app.logger.info(f"Step 4: Found {len(union_of_plans)} unique plans for scoring: {union_of_plans}")

    try:
        derived_conn = get_derived_db_connection()
        all_plans_df = pd.read_sql_query("SELECT * FROM features", derived_conn)
        derived_conn.close()
        plans_to_score_df = all_plans_df[all_plans_df['Plan_Name'].isin(union_of_plans)].copy()
        if 'Plan_Name' in plans_to_score_df.columns:
            plans_to_score_df.rename(columns={'Plan_Name': 'Plan Name'}, inplace=True)
        current_app.logger.info(f"Step 5: Loaded {len(plans_to_score_df)} plans from DB for scoring.")
    except Exception as e:
        current_app.logger.error(f"Error loading features from database: {e}")
        return jsonify({'error': 'Could not load plan features from the database.'}), 500

    if plans_to_score_df.empty:
        return render_template('Analysis_Dashboard.html', unique_id=unique_id, client_data=client_data, analysis={'option_1_full_family_plans': {}, 'option_2_combination_plans': {'individual_plans': {}, 'combo_plans': {}}}, ranked_plans=[], supervisor_status=supervisor_status)

    primary_applicant_key = next(iter(derived_features))
    primary_applicant_gender = derived_features.get(primary_applicant_key, {}).get('gender', '').lower()
    if 'Gender' in plans_to_score_df.columns:
        if primary_applicant_gender != 'female':
            initial_count = len(plans_to_score_df)
            plans_to_score_df = plans_to_score_df[plans_to_score_df['Gender'].str.strip().str.lower().ne('female').fillna(True)]
            filtered_count = initial_count - len(plans_to_score_df)
            if filtered_count > 0:
                current_app.logger.info(f"Step 5a: Filtered out {filtered_count} women-only plans.")

    if 'Policy_Code' in plans_to_score_df.columns:
        all_members = [client_data.get('primaryContact', {})] + client_data.get('members', [])
        num_adults = sum(1 for m in all_members if m and int(m.get('age', 0)) >= 25)
        num_children = sum(1 for m in all_members if m and int(m.get('age', 0)) < 25)
        current_app.logger.info(f"Family composition: {num_adults} Adult(s), {num_children} Child(ren).")
        initial_count = len(plans_to_score_df)
        plans_to_score_df['is_valid_family_plan'] = plans_to_score_df['Policy_Code'].apply(lambda x: is_plan_valid_for_family(x, num_adults, num_children, current_app.logger))
        plans_to_score_df = plans_to_score_df[plans_to_score_df['is_valid_family_plan']].drop(columns=['is_valid_family_plan'])
        filtered_count = initial_count - len(plans_to_score_df)
        if filtered_count > 0:
            current_app.logger.info(f"Step 5b: Filtered out {filtered_count} plans based on family structure.")

        # Categorize the remaining valid plans
        plans_to_score_df['Category'] = plans_to_score_df['Policy_Code'].apply(categorize_plan)
        family_floater_plans = plans_to_score_df[plans_to_score_df['Category'] == 'Family Floater']
        individual_plans = plans_to_score_df[plans_to_score_df['Category'] == 'Individual']
        current_app.logger.info(f"Step 5c: Categorized plans -> {len(family_floater_plans)} Family Floaters, {len(individual_plans)} Individual plans.")

    scored_plans_df = compute_member_aware_scores(plans_to_score_df, client_data)
    current_app.logger.info(f"Step 6: Computed member-aware scores for {len(scored_plans_df)} plans.")

    primary_applicant_name = client_data.get("primaryContact", {}).get("applicant_name", "Self")
    other_member_names = [m.get('name') for m in client_data.get('members', []) if m.get('name')]
    sort_order = []
    primary_score_col = f"Score_{primary_applicant_name}"
    if primary_score_col in scored_plans_df.columns:
        sort_order.append(primary_score_col)
    for member_name in other_member_names:
        member_score_col = f"Score_{member_name}"
        if member_score_col in scored_plans_df.columns:
            sort_order.append(member_score_col)
    sort_order.extend(['AilmentScore', 'Score_MemberAware'])
    ranked_plans_df = scored_plans_df.sort_values(by=sort_order, ascending=False)
    current_app.logger.info(f"Step 6a: Sorted plans by {sort_order}.")

    family_structure = {'adults': num_adults, 'children': num_children}
    analysis_results = bundle_plans_by_score(initial_plans, ranked_plans_df, family_structure)
    current_app.logger.info(f"Step 7: Bundled plans into Option 1 and 2.")

    ranked_plans_df['Rank'] = range(1, len(ranked_plans_df) + 1)
    member_score_cols = [col for col in ranked_plans_df.columns if col.startswith('Score_') and col not in ['AilmentScore', 'Score_MemberAware']]
    
    # Consolidate all data into the analysis_results dictionary
    analysis_results['all_ranked_plans'] = ranked_plans_df.to_dict(orient='records')
    analysis_results['member_score_columns'] = member_score_cols

    current_app.logger.info(f"Step 8: Final analysis structure prepared for rendering.")

    return render_template(
        'Analysis_Dashboard.html',
        unique_id=unique_id,
        client_data=client_data,
        analysis=analysis_results, # Pass the consolidated dictionary
        supervisor_status=supervisor_status
    )
