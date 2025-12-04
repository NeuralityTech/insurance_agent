import json
import pandas as pd
from flask import Blueprint, jsonify, render_template, current_app
from collections import Counter
from ..database import get_db_connection, get_user_db_connection, get_derived_db_connection
from itertools import chain
from ..analysis.get_plans import fetch_plans
from ..analysis.ailment_score import compute_member_aware_scores
from ..analysis.plan_analyzer import bundle_plans_by_score
from ..analysis.query_fetcher import generate, clean_and_parse
from .analysis import _clean_nan

dashboard_bp = Blueprint('dashboard_bp', __name__)

@dashboard_bp.route('/stats', methods=['GET'])
def get_stats():
    user_conn = get_user_db_connection()
    cursor = user_conn.cursor()
    agent_count = cursor.execute('SELECT COUNT(*) FROM Agent').fetchone()[0]
    supervisor_count = cursor.execute('SELECT COUNT(*) FROM Supervisor').fetchone()[0]
    user_conn.close()
    conn = get_db_connection()
    client_count = conn.execute('SELECT COUNT(*) FROM submissions').fetchone()[0]
    conn.close()
    return jsonify({'agents': agent_count, 'supervisors': supervisor_count, 'clients': client_count}), 200

@dashboard_bp.route('/agents', methods=['GET'])
def list_agents():
    try:
        conn = get_user_db_connection()
        rows = conn.execute('SELECT name, user_id, phone_number, supervisor_id FROM Agent').fetchall()
        result = [{'name': r['name'], 'user_id': r['user_id'], 'phone_number': r['phone_number'], 'supervisor_id': r['supervisor_id']} for r in rows]
        return jsonify(result), 200
    except Exception as e:
        current_app.logger.error(f"Error listing agents: {e}")
        return jsonify({'error': 'Failed to fetch agents'}), 500
    finally:
        if conn:
            conn.close()

@dashboard_bp.route('/supervisors', methods=['GET'])
def list_supervisors():
    try:
        conn = get_user_db_connection()
        supervisors = conn.execute('SELECT name, user_id, phone_number FROM Supervisor').fetchall()
        agents = conn.execute('SELECT name, user_id, phone_number, supervisor_id FROM Agent').fetchall()
        agent_map = {}
        for a in agents:
            agent_map.setdefault(a['supervisor_id'], []).append({'name': a['name'], 'user_id': a['user_id'], 'phone_number': a['phone_number']})
        result = []
        for s in supervisors:
            result.append({'name': s['name'], 'user_id': s['user_id'], 'phone_number': s['phone_number'], 'agents': agent_map.get(s['user_id'], [])})
        return jsonify(result), 200
    except Exception as e:
        current_app.logger.error(f"Error listing supervisors: {e}")
        return jsonify({'error': 'Failed to fetch supervisors'}), 500
    finally:
        if conn:
            conn.close()

@dashboard_bp.route('/clients', methods=['GET'])
def list_clients():
    try:
        conn = get_db_connection()
        rows = conn.execute('''
            SELECT 
                COALESCE(full_name, json_extract(form_summary, '$.primaryContact.applicant_name')) AS name,
                unique_id,
                agent,
                supervisor_approval_status,
                supervisor_modified_by,
                application_status,
                COALESCE(
                    json_extract(form_summary, '$.primaryContact.phone'),
                    json_extract(form_summary, '$.phone'),
                    json_extract(form_summary, '$.primaryContact.mobile'),
                    json_extract(form_summary, '$.mobile')
                ) AS phone
            FROM submissions
            ORDER BY timestamp DESC
        ''').fetchall()
        # Expose application_status directly; keep supervisor_status (lowercased) for backward compatibility
        result = [{
            'name': r['name'],
            'unique_id': r['unique_id'],
            'agent': r['agent'],
            'supervisor_status': (r['supervisor_approval_status'] or '').lower(),
            'supervisor_modified_by': r['supervisor_modified_by'],
            'application_status': r['application_status'],
            'phone': r['phone'] or ''
        } for r in rows]
        return jsonify(result), 200
    except Exception as e:
        current_app.logger.error(f"Error listing clients: {e}")
        return jsonify({'error': 'Failed to fetch clients'}), 500
    finally:
        if conn:
            conn.close()

@dashboard_bp.route('/admin/dashboard')
def admin_dashboard():
    try:
        conn = get_derived_db_connection()
        cols_df = pd.read_sql_query('PRAGMA table_info(features)', conn)
        available_cols = set(cols_df['name'].tolist())
        select_cols = ['Plan_Name', 'Status']
        if 'Created_On' in available_cols: select_cols.append('Created_On')
        if 'Last_Modified_On' in available_cols: select_cols.append('Last_Modified_On')
        if 'Last_Modified_By' in available_cols: select_cols.append('Last_Modified_By')
        query = f"SELECT {', '.join(select_cols)} FROM features"
        plans_df = pd.read_sql_query(query, conn)
        rename_map = {'Plan_Name': 'Plan Name'}
        if 'Created_On' in plans_df.columns: rename_map['Created_On'] = 'Created On'
        if 'Last_Modified_On' in plans_df.columns: rename_map['Last_Modified_On'] = 'Last Modified Date'
        if 'Last_Modified_By' in plans_df.columns: rename_map['Last_Modified_By'] = 'Last Modified By'
        plans_df.rename(columns=rename_map, inplace=True)
        conn.close()
        plans = plans_df.to_dict(orient='records')
        current_app.logger.info(f"Fetched {len(plans)} plans for admin dashboard.")
        return render_template('Admin_Dashboard.html', plans=plans)
    except Exception as e:
        current_app.logger.error(f"Error fetching plans for admin dashboard: {e}")
        return render_template('Admin_Dashboard.html', error=f"Could not fetch plans. Error: {e}", plans=[])

@dashboard_bp.route('/client_details/<unique_id>')
def get_client_details(unique_id):
    conn = get_db_connection()
    row = conn.execute('SELECT form_summary, plans_chosen, supervisor_approval_status FROM submissions WHERE unique_id = ?', (unique_id,)).fetchone()
    conn.close()
    if not row: return jsonify({'error': 'Submission not found.'}), 404
    client_data = json.loads(row['form_summary'])
    chosen_plans = json.loads(row['plans_chosen']) if row['plans_chosen'] else []
    supervisor_status = (row['supervisor_approval_status'] or '').upper() if 'supervisor_approval_status' in row.keys() else ''
    derived_text = generate(json.dumps(client_data))
    derived_features = clean_and_parse(derived_text)
    # fetch_plans expects (summary, client_data)
    initial_plans = fetch_plans(derived_features, client_data)

    # Build family structure from derived features
    def _is_member(k, v):
        return isinstance(v, dict) and ('name' in v or 'age' in v or 'disease_code' in v)
    member_ages = {}
    member_ailments = {}
    for key, val in derived_features.items():
        if not _is_member(key, val):
            continue
        name = val.get('name') or key
        try:
            age = int(val.get('age') or 0)
        except Exception:
            age = 0
        member_ages[name] = age
        dcodes = (val.get('disease_code') or '').strip()
        if dcodes:
            codes = [c.strip().upper() for c in dcodes.split(',') if c.strip() and c.strip().upper() != 'GENERAL']
        else:
            codes = []
        member_ailments[name] = codes
    adult_age_threshold = 25
    num_adults = sum(1 for a in member_ages.values() if a >= adult_age_threshold)
    num_children = max(0, len(member_ages) - num_adults)
    family_structure = {
        'adults': num_adults,
        'children': num_children,
        'member_ailments': member_ailments,
        'member_ages': member_ages,
    }
    union_of_plans = set(chain.from_iterable(p['plans'] for p in initial_plans.values() if p.get('plans')))
    if not union_of_plans:
        safe_payload = _clean_nan({'summary': client_data, 'analysis': {'option_1_full_family_plans': {}, 'option_2_combination_plans': {'individual_plans': {}, 'combo_plans': {}}}, 'ranked_plans': [], 'chosen_plans': chosen_plans, 'supervisor_status': supervisor_status, 'proposed_plans': {}})
        return jsonify(safe_payload)
    try:
        derived_conn = get_derived_db_connection()
        all_plans_df = pd.read_sql_query("SELECT * FROM features", derived_conn)
        derived_conn.close()
        plans_to_score_df = all_plans_df[all_plans_df['Plan_Name'].isin(union_of_plans)].copy()
        if 'Plan_Name' in plans_to_score_df.columns:
            plans_to_score_df.rename(columns={'Plan_Name': 'Plan Name'}, inplace=True)
        # Precompute Family_Fit for visibility/debugging
        def _capacity_from_policy(policy_code: str):
            try:
                parts = str(policy_code).strip().upper().split('_')
                if len(parts) == 3 and parts[0] in ('FLO', 'MIX') and parts[1].isdigit() and parts[2].isdigit():
                    return int(parts[1]), int(parts[2])
            except Exception:
                pass
            return 1, 0  # default individual plan
        if 'Policy_Code' in plans_to_score_df.columns:
            caps = plans_to_score_df['Policy_Code'].apply(_capacity_from_policy)
            plans_to_score_df['Plan_Adults'] = caps.apply(lambda t: t[0])
            plans_to_score_df['Plan_Children'] = caps.apply(lambda t: t[1])
            plans_to_score_df['Family_Fit'] = (
                (plans_to_score_df['Plan_Adults'] >= family_structure['adults']) &
                (plans_to_score_df['Plan_Children'] >= family_structure['children'])
            ).astype(int)
    except Exception as e:
        return jsonify({'error': 'Could not load plan features from the database.'}), 500
    if plans_to_score_df.empty:
        safe_payload = _clean_nan({'summary': client_data, 'analysis': {'option_1_full_family_plans': {}, 'option_2_combination_plans': {'individual_plans': {}, 'combo_plans': {}}}, 'ranked_plans': [], 'chosen_plans': chosen_plans, 'supervisor_status': supervisor_status, 'proposed_plans': initial_plans})
        return jsonify(safe_payload)
    # compute_member_aware_scores expects (plans_df, derived_features, app)
    scored_plans_df = compute_member_aware_scores(plans_to_score_df, derived_features, current_app)
    # bundle_plans_by_score expects a family_structure dict
    analysis_results = bundle_plans_by_score(initial_plans, scored_plans_df, family_structure)
    ranked_plans_df = scored_plans_df.sort_values(by=['Score_MemberAware'], ascending=False)
    ranked_plans_df['Rank'] = range(1, len(ranked_plans_df) + 1)
    # Replace NaN with None to produce valid JSON
    safe_ranked = ranked_plans_df.where(pd.notnull(ranked_plans_df), None)
    ranked_plans_json = safe_ranked.to_dict(orient='records')
    safe_payload = _clean_nan({'summary': client_data, 'analysis': analysis_results, 'ranked_plans': ranked_plans_json, 'chosen_plans': chosen_plans, 'supervisor_status': supervisor_status, 'proposed_plans': initial_plans})
    return jsonify(safe_payload)

@dashboard_bp.route('/submissions', methods=['GET'])
def list_submissions():
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM submissions').fetchall()
    conn.close()
    submissions = [dict(row) for row in rows]
    current_app.logger.info("Listing %d submissions", len(submissions))
    return jsonify(submissions), 200

from .analysis import _run_full_analysis

@dashboard_bp.route('/plan_analysis_dashboard')
def plan_analysis_dashboard():
    """Runs analysis on all submissions and aggregates the results for a dashboard."""
    conn = get_db_connection()
    submissions = conn.execute('SELECT unique_id, form_summary FROM submissions').fetchall()
    conn.close()

    all_clients_analysis = []
    for submission in submissions:
        client_data = json.loads(submission['form_summary'])
        client_name = client_data.get('primaryContact', {}).get('applicant_name', 'Unknown Client')
        unique_id = submission['unique_id']

        # Generate derived features for this client
        derived_text = generate(json.dumps(client_data))
        derived_features = clean_and_parse(derived_text)
        
        # Run the full analysis
        analysis_result = _run_full_analysis(client_data, derived_features, current_app)
        if analysis_result:
            all_clients_analysis.append({
                'client_name': client_name,
                'unique_id': unique_id,
                'analysis': analysis_result
            })

    # Prepare data for the template
    dashboard_data = {
        'total_clients_analyzed': len(all_clients_analysis),
        'client_analyses': all_clients_analysis
    }

    return render_template('Plan_Analysis_Dashboard.html', data=dashboard_data, supervisor_status=None) # Pass a default value

@dashboard_bp.route('/api/admin/plans_in_use', methods=['GET'])
def get_plans_in_use():
    """Get count of unique plans that have been used in created policies."""
    try:
        conn = get_db_connection()
        
        # Query to find all unique plan names from policy_details (created policies only)
        query = """
        SELECT DISTINCT plan_name FROM (
            -- From policy_details JSON (actual created policies)
            SELECT json_extract(json_each.value, '$.plan') as plan_name
            FROM submissions, json_each(json_extract(policy_details, '$.rows'))
            WHERE policy_details IS NOT NULL 
            AND policy_details != ''
            AND close_status = 'Policy_Created'
            
            UNION
            
            -- From policy_name column (legacy/simple policies)
            SELECT policy_name as plan_name
            FROM submissions
            WHERE policy_name IS NOT NULL 
            AND policy_name != ''
            AND close_status = 'Policy_Created'
        ) WHERE plan_name IS NOT NULL AND plan_name != ''
        """
        
        cursor = conn.cursor()
        cursor.execute(query)
        results = cursor.fetchall()
        
        # Count unique plans
        unique_plans = set()
        for row in results:
            plan_name = row[0]
            if plan_name:
                # Handle cases where plan names might include member prefixes like "John - Plan Name"
                # Extract just the plan name part
                if ' - ' in plan_name:
                    plan_name = plan_name.split(' - ', 1)[1]
                unique_plans.add(plan_name.strip())
        
        conn.close()
        
        return jsonify({
            'count': len(unique_plans),
            'plans': sorted(list(unique_plans))
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching plans in use: {e}")
        return jsonify({
            'count': 0,
            'error': str(e)
        }), 500