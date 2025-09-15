import json
import pandas as pd
from flask import Blueprint, jsonify, render_template, current_app
from ..database import get_db_connection, get_user_db_connection, get_derived_db_connection
from itertools import chain
from ..analysis.get_plans import fetch_plans
from ..analysis.ailment_score import compute_member_aware_scores
from ..analysis.plan_analyzer import bundle_plans_by_score
from ..analysis.query_fetcher import generate, clean_and_parse

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
        rows = conn.execute('''SELECT COALESCE(full_name, json_extract(form_summary, '$.primaryContact.applicant_name')) AS name, unique_id, agent, supervisor_approval_status FROM submissions ORDER BY timestamp DESC''').fetchall()
        result = [{'name': r['name'], 'unique_id': r['unique_id'], 'agent': r['agent'], 'supervisor_status': (r['supervisor_approval_status'] or '').lower()} for r in rows]
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
    initial_plans = fetch_plans(derived_features)
    union_of_plans = set(chain.from_iterable(p['plans'] for p in initial_plans.values() if p.get('plans')))
    if not union_of_plans:
        return jsonify({'summary': client_data, 'analysis': {'option_1_full_family_plans': {}, 'option_2_combination_plans': {'individual_plans': {}, 'combo_plans': {}}}, 'ranked_plans': [], 'chosen_plans': chosen_plans, 'supervisor_status': supervisor_status})
    try:
        derived_conn = get_derived_db_connection()
        all_plans_df = pd.read_sql_query("SELECT * FROM features", derived_conn)
        derived_conn.close()
        plans_to_score_df = all_plans_df[all_plans_df['Plan_Name'].isin(union_of_plans)].copy()
        if 'Plan_Name' in plans_to_score_df.columns:
            plans_to_score_df.rename(columns={'Plan_Name': 'Plan Name'}, inplace=True)
    except Exception as e:
        return jsonify({'error': 'Could not load plan features from the database.'}), 500
    if plans_to_score_df.empty:
        return jsonify({'summary': client_data, 'analysis': {'option_1_full_family_plans': {}, 'option_2_combination_plans': {'individual_plans': {}, 'combo_plans': {}}}, 'ranked_plans': [], 'chosen_plans': chosen_plans, 'supervisor_status': supervisor_status})
    scored_plans_df = compute_member_aware_scores(plans_to_score_df, client_data)
    analysis_results = bundle_plans_by_score(initial_plans, scored_plans_df)
    ranked_plans_df = scored_plans_df.sort_values(by=['Score_MemberAware'], ascending=False)
    ranked_plans_df['Rank'] = range(1, len(ranked_plans_df) + 1)
    ranked_plans_json = ranked_plans_df.to_dict(orient='records')
    return jsonify({'summary': client_data, 'analysis': analysis_results, 'ranked_plans': ranked_plans_json, 'chosen_plans': chosen_plans, 'supervisor_status': supervisor_status})

@dashboard_bp.route('/submissions', methods=['GET'])
def list_submissions():
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM submissions').fetchall()
    conn.close()
    submissions = [dict(row) for row in rows]
    current_app.logger.info("Listing %d submissions", len(submissions))
    return jsonify(submissions), 200
