import os
import json
import pandas as pd
from itertools import chain
from flask import Blueprint, jsonify, render_template, current_app
from ..database import get_db_connection, get_derived_db_connection
from ..analysis.get_plans import fetch_plans
from ..analysis.plan_analyzer import bundle_plans_by_score, analyze_plan_intersections
from ..analysis.ailment_score import compute_member_aware_scores
from ..analysis.plan_utils import is_plan_valid_for_family, get_plan_capacity
from ..analysis.query_fetcher import generate, clean_and_parse

analysis_bp = Blueprint('analysis_bp', __name__)

def _clean_nan(data):
    """Recursively converts NaN values in a nested data structure to None.
    Retained for backward compatibility with modules that import this helper.
    """
    if isinstance(data, dict):
        return {k: _clean_nan(v) for k, v in data.items()}
    if isinstance(data, list):
        return [_clean_nan(i) for i in data]
    try:
        # Use pandas to detect NaN/NaT safely where available
        if isinstance(data, float) and pd.isna(data):
            return None
    except Exception:
        pass
    return data

def _safe_int(val, default=0):
    try:
        if val is None or val == '':
            return int(default)
        if isinstance(val, str) and ('.' in val or val.strip().isdigit() is False):
            return int(float(val))
        return int(val)
    except Exception:
        return int(default)

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

    # New Rule: Floater plans are only valid for families with more than one member.
    if 'FLO' in code and total_members <= 1:
        return False

    # Handle special case MIX_1_1: One adult OR one child
    if code == 'MIX_1_1':
        return (num_adults == 1 and num_children == 0) or (num_adults == 0 and num_children == 1)

    parts = code.split('_')
    if len(parts) != 3:
        logger.warning(f"Unrecognized Policy_Code format '{policy_code}'. Assuming it's a flexible plan to avoid incorrect filtering.")
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
            max_children = 6  # Cap at a realistic number
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
        
        # An individual plan should only be proposed for a single person.
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

def _run_full_analysis(client_data, derived_features, current_app):
    """Runs the entire plan analysis pipeline for a given client and returns the results."""
    config_path = os.path.join(current_app.root_path, 'select_plans_config.json')
    with open(config_path, 'r') as f:
        select_config = json.load(f)
    adult_age_threshold = select_config.get('family_composition', {}).get('adult_age_threshold', 25)

    initial_plans = fetch_plans(derived_features, client_data)
    current_app.logger.info(f"Step 3: Fetched initial plan recommendations.")

    disease_specific_plans = set()
    general_plans_to_filter = set()
    for member_key, member_data in initial_plans.items():
        if not member_data.get('plans'):
            continue
        disease_code = derived_features.get(member_key, {}).get('disease_code', 'GENERAL').upper()
        if disease_code == 'GENERAL':
            general_plans_to_filter.update(member_data['plans'])
        else:
            disease_specific_plans.update(member_data['plans'])

    try:
        derived_conn = get_derived_db_connection()
        all_plans_df = pd.read_sql_query("SELECT * FROM features", derived_conn)
        derived_conn.close()
        if 'Plan_Name' in all_plans_df.columns:
            all_plans_df.rename(columns={'Plan_Name': 'Plan Name'}, inplace=True)
    except Exception as e:
        current_app.logger.error(f"Error loading features from database: {e}")
        return None # Return None on error

    valid_general_plans_df = pd.DataFrame()
    if general_plans_to_filter:
        general_plans_df = all_plans_df[all_plans_df['Plan Name'].isin(general_plans_to_filter)].copy()
        if not general_plans_df.empty:
            # Correctly gather all members, including the primary applicant
            primary_applicant = {k: v for k, v in client_data.items() if k != 'members'}
            all_members = [primary_applicant] + client_data.get('members', [])
            num_adults_calc = sum(1 for m in all_members if m and _safe_int(m.get('age', 0), 0) >= adult_age_threshold)
            num_children_calc = sum(1 for m in all_members if m and _safe_int(m.get('age', 0), 0) < adult_age_threshold)
            general_plans_df['is_valid'] = general_plans_df['Policy_Code'].apply(lambda x: is_plan_valid_for_family(x, num_adults_calc, num_children_calc, current_app.logger))
            valid_general_plans_df = general_plans_df[general_plans_df['is_valid']]

    disease_specific_plans_df = all_plans_df[all_plans_df['Plan Name'].isin(disease_specific_plans)]
    plans_to_score_df = pd.concat([disease_specific_plans_df, valid_general_plans_df]).drop_duplicates(subset=['Plan Name']).reset_index(drop=True)

    if plans_to_score_df.empty:
        return {'option_1_full_family_plans': {}, 'option_2_combination_plans': {}, 'all_ranked_plans': [], 'member_score_columns': []}

    # Continue with the rest of the analysis logic...
    scored_plans_df = compute_member_aware_scores(plans_to_score_df, derived_features, current_app)
    ranked_plans_df = scored_plans_df.sort_values(by='AilmentScore', ascending=False)

    num_adults = _safe_int(derived_features.get('num_adults', 0), 0)
    num_children = _safe_int(derived_features.get('num_children', 0), 0)

    def check_family_fit(policy_code, family_adults, family_children):
        plan_adults, plan_children = get_plan_capacity(policy_code)
        # A plan is a fit if it meets the exact capacity or exceeds it.
        return family_adults <= plan_adults and family_children <= plan_children

    ranked_plans_df['Family_Fit'] = ranked_plans_df['Policy_Code'].apply(
        lambda code: check_family_fit(code, num_adults, num_children)
    )

    member_ailments = {}
    member_ages = {}
    for key, value in derived_features.items():
        if key.startswith('member'):
            name = value.get('name')
            if name:
                disease_code = value.get('disease_code', 'GENERAL')
                if disease_code and disease_code != 'GENERAL':
                    if disease_code.startswith('MULTI'):
                        member_ailments[name] = [code.strip() for code in disease_code.split(',')[1:]]
                    else:
                        member_ailments[name] = [disease_code]
                else:
                    member_ailments[name] = []
                age_str = value.get('age') or value.get('child_age', '0')
                member_ages[name] = _safe_int(age_str, 0)

    family_structure = {
        'adults': num_adults,
        'children': num_children,
        'member_ailments': member_ailments,
        'member_ages': member_ages
    }
    
    analysis_results = bundle_plans_by_score(initial_plans, ranked_plans_df, family_structure)
    
    ranked_plans_df['Rank'] = range(1, len(ranked_plans_df) + 1)
    member_score_cols = [col for col in ranked_plans_df.columns if col.startswith('Score_') and col not in ['AilmentScore', 'Score_MemberAware']]
    
    # CRITICAL FIX: Clean the final DataFrame for safe JSON serialization
    # This is the true source of the NaN error.
    ranked_plans_df = ranked_plans_df.where(pd.notnull(ranked_plans_df), None)
    analysis_results['all_ranked_plans'] = ranked_plans_df.to_dict(orient='records')
    analysis_results['member_score_columns'] = member_score_cols

    # Backward compatibility for template keys
    # Analysis_Dashboard.html expects: browse_all, best_floater, combination_packages
    if 'browse_all' not in analysis_results:
        analysis_results['browse_all'] = analysis_results.get('all_ranked_plans', [])
    if 'best_floater' not in analysis_results:
        analysis_results['best_floater'] = analysis_results.get('option_1_full_family_plans', {})
    if 'combination_packages' not in analysis_results:
        analysis_results['combination_packages'] = analysis_results.get('option_2_combination_plans', {})

    # Ensure the entire payload is JSON-safe (convert any remaining NaN/NaT to None)
    analysis_results = _clean_nan(analysis_results)

    # --- Generate and Print Justification Report ---
    # This now happens AFTER scoring to include score details.
    justification_report = _generate_justification_report(
        initial_plans, derived_features, ranked_plans_df, current_app
    )

    # --- Enhance the report with AI-generated narrative and reasoning ---
    # The AI is now responsible for creating the final JSON structure.
    final_report = _get_ai_enhanced_report(justification_report, current_app)

    # Add the family composition to the final AI-generated report
    final_report['family_composition'] = {
        'num_adults': num_adults,
        'num_children': num_children
    }

    # --- Save and Print Justification Report ---
    reports_dir = os.path.join(current_app.root_path, '..', 'justification_reports')
    os.makedirs(reports_dir, exist_ok=True)
    report_path = os.path.join(reports_dir, f"{client_data.get('unique_id', 'report')}.json")
    with open(report_path, 'w') as f:
        json.dump(final_report, f, indent=4)

    print("\n--- Plan Selection Justification Report ---")
    print(f"(Report also saved to {report_path})")
    print(json.dumps(final_report, indent=4))
    print("--- End of Report ---\n")

    return analysis_results

def _get_ai_enhanced_report(justification_report, current_app):
    """Calls the Gemini model to enhance the report with a narrative and per-plan reasoning."""
    try:
        prompt_path = os.path.join(current_app.root_path, 'prompt2.txt')
        with open(prompt_path, 'r') as f:
            system_prompt = f.read()
        
        # The AI is now expected to return a full JSON object.
        # We wrap the justification data in a temporary object for the prompt.
        prompt_data = {'detailed_justification': justification_report}
        ai_response_text = generate(
            text=json.dumps(prompt_data),
            system_prompt_text=system_prompt
        )
        
        # Clean and parse the JSON response from the AI
        return clean_and_parse(ai_response_text)
    except Exception as e:
        current_app.logger.error(f"Failed to generate narrative summary: {e}")
        return "Narrative summary could not be generated due to an error."

def _generate_justification_report(initial_plans, derived_features, scored_plans_df, current_app):
    """Generates a detailed report on why each plan was selected, including scores."""
    justification_data = []
    member_score_cols = [col for col in scored_plans_df.columns if col.startswith('Score_') and col not in ['AilmentScore', 'Score_MemberAware']]

    for _, plan_row in scored_plans_df.iterrows():
        plan_name = plan_row['Plan Name']
        
        # Aggregate all proposers for the plan
        proposers = []
        for member_key, member_data in initial_plans.items():
            if plan_name in member_data.get('plans', []):
                disease_code = derived_features.get(member_key, {}).get('disease_code', 'GENERAL').upper()
                proposer_name = derived_features.get(member_key, {}).get('name', member_key)
                proposers.append({'name': proposer_name, 'disease_code': disease_code})

        # Consolidate family fit check
        plan_category = categorize_plan(plan_row['Policy_Code'])
        if plan_category == 'Family Floater':
            family_fit_result = "Passed" if plan_row.get('Family_Fit') else "Failed"
        else:
            family_fit_result = "Not Applicable (Individual Plan)"

        # Get member specific scores
        member_scores = {}
        for col in member_score_cols:
            member_name = col.replace('Score_', '')
            member_scores[member_name] = round(plan_row.get(col, 0.0), 2)

        # Format the proposer information for the report, excluding generic categories
        proposer_names = [p['name'] for p in proposers if p.get('name') and p['name'] != 'comprehensive_cover']
        proposer_reasons = list(set([p['disease_code'] for p in proposers]))

        justification = {
            'plan_name': plan_name,
            'policy_code': plan_row['Policy_Code'],
            'proposed_for': proposer_names,
            'reason_for_proposal': f"Proposed for members with needs: {', '.join(proposer_reasons)}",
            'family_fit_check_result': family_fit_result,
            'ailment_score': round(plan_row.get('AilmentScore', 0.0), 2),
            'member_specific_scores': member_scores,
            'final_status': 'SCORED_AND_CONSIDERED_FOR_BUNDLING'
        }
        justification_data.append(justification)

    return justification_data


@analysis_bp.route('/proposed_plans/<unique_id>')
def get_proposed_plans(unique_id):
    conn = get_db_connection()
    row = conn.execute('SELECT form_summary, supervisor_approval_status, supervisor_comments, supervisor_modified_at, supervisor_modified_by FROM submissions WHERE unique_id = ?', (unique_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Submission not found.'}), 404
    
    client_data = json.loads(row['form_summary'])
    supervisor_status = (row['supervisor_approval_status'] or '').upper() if 'supervisor_approval_status' in row.keys() else ''
    current_app.logger.info(f"Step 1: Fetched client data for {unique_id}")

    # Generate derived features from the form summary
    derived_text = generate(json.dumps(client_data))
    derived_features = clean_and_parse(derived_text)
    current_app.logger.info(f"Step 2: Generated derived features.")

    # Run the full analysis pipeline
    analysis_results = _run_full_analysis(client_data, derived_features, current_app)

    if analysis_results is None:
        return jsonify({'error': 'An error occurred during plan analysis.'}), 500

    current_app.logger.info(f"Step 8: Final analysis structure prepared for rendering.")

    return render_template(
        'Analysis_Dashboard.html',
        unique_id=unique_id,
        client_data=client_data,
        analysis=analysis_results,
        supervisor_status=supervisor_status,
        supervisor_comments=row['supervisor_comments'] if row['supervisor_comments'] else '',
        supervisor_modified_at=row['supervisor_modified_at'] if row['supervisor_modified_at'] else '',
        supervisor_modified_by=row['supervisor_modified_by'] if row['supervisor_modified_by'] else ''
    )
