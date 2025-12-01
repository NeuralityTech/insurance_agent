import json
from flask import Blueprint, request, jsonify, current_app
from datetime import datetime
from ..database import get_db_connection, get_derived_db_connection, insert_application_status_log_entry
# Temporarily commented out to avoid import issues
# from ..utils.timestamp_utils import get_current_timestamp_iso

actions_bp = Blueprint('actions_bp', __name__)

# --- Helper: recompute and persist final_* rollup for a submission (same logic as approvals.py) ---
def _recompute_final_for(conn, unique_id: str):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT supervisor_approval_status, supervisor_comments, supervisor_modified_at, supervisor_modified_by,
               underwriter_status, underwriter_comments, underwriter_modified_at, underwriter_modified_by,
               policy_outcome, policy_outcome_comment, policy_outcome_modified_at, policy_outcome_modified_by,
               close_status, close_status_modified_at, close_status_modified_by
        FROM submissions WHERE unique_id = ?
        """,
        (unique_id,)
    )
    row = cur.fetchone()
    if not row:
        return
    cols = [
        "supervisor_approval_status","supervisor_comments","supervisor_modified_at","supervisor_modified_by",
        "underwriter_status","underwriter_comments","underwriter_modified_at","underwriter_modified_by",
        "policy_outcome","policy_outcome_comment","policy_outcome_modified_at","policy_outcome_modified_by",
        "close_status","close_status_modified_at","close_status_modified_by"
    ]
    d = dict(zip(cols, row))
    candidates = []
    for src, ts_key in (
        ("supervisor", "supervisor_modified_at"),
        ("underwriter", "underwriter_modified_at"),
        ("policy", "policy_outcome_modified_at"),
        ("application", "close_status_modified_at"),
    ):
        ts = d.get(ts_key)
        if ts and str(ts).strip():
            candidates.append((str(ts), src))
    if not candidates:
        return
    candidates.sort(key=lambda x: x[0])
    latest_ts, latest_src = candidates[-1]
    if latest_src == 'supervisor':
        f_status = d.get('supervisor_approval_status')
        f_comments = d.get('supervisor_comments')
        f_by = d.get('supervisor_modified_by')
    elif latest_src == 'underwriter':
        f_status = d.get('underwriter_status')
        f_comments = d.get('underwriter_comments')
        f_by = d.get('underwriter_modified_by')
    elif latest_src == 'policy':
        f_status = d.get('policy_outcome')
        f_comments = d.get('policy_outcome_comment')
        f_by = d.get('policy_outcome_modified_by')
    else:
        f_status = d.get('close_status')
        f_comments = None
        f_by = d.get('close_status_modified_by')
    cur.execute(
        """
        UPDATE submissions
        SET application_status = ?, application_comments = ?, application_modified_at = ?, application_modified_by = ?
        WHERE unique_id = ?
        """,
        (f_status, f_comments, latest_ts, f_by, unique_id)
    )
    # Append audit log (no overwrite) to Final_Status.db
    try:
        insert_application_status_log_entry(unique_id, f_status, f_comments, latest_ts, f_by, source=latest_src)
    except Exception:
        pass

@actions_bp.route('/admin/update_plan_status', methods=['POST'])
def update_plan_status():
    data = request.get_json()
    updates = data.get('updates')
    meta = data.get('meta') or {}

    if not isinstance(updates, dict):
        return jsonify({'error': 'Invalid data format.'}), 400

    conn = None
    try:
        conn = get_derived_db_connection()
        cursor = conn.cursor()
        cursor.execute('PRAGMA table_info(features)')
        available_cols = {row[1] for row in cursor.fetchall()}
        has_last_on = 'Last_Modified_On' in available_cols
        has_last_by = 'Last_Modified_By' in available_cols

        for plan_name, new_status in updates.items():
            status_norm = (new_status or '').strip().lower()
            if status_norm not in ['active', 'inactive']:
                raise ValueError(f"Invalid status '{new_status}' for plan '{plan_name}'.")

            fields = ['Status = ?']
            params = [status_norm]
            m = meta.get(plan_name) or {}
            last_on = m.get('lastModifiedOn')
            last_by = m.get('lastModifiedBy')

            if has_last_on and last_on: fields.append('Last_Modified_On = ?'); params.append(last_on)
            if has_last_by and last_by: fields.append('Last_Modified_By = ?'); params.append(last_by)

            params.append(plan_name)
            sql = f"UPDATE features SET {', '.join(fields)} WHERE Plan_Name = ?"
            cursor.execute(sql, tuple(params))
            current_app.logger.info(f"Queued update for plan '{plan_name}' to '{new_status}' with meta {m}.")

        conn.commit()
        current_app.logger.info("Successfully committed all plan status updates.")
        return jsonify({'success': True}), 200
    except Exception as e:
        if conn: conn.rollback()
        current_app.logger.error(f"Error updating plan statuses: {e}")
        return jsonify({'error': 'Database update failed.'}), 500
    finally:
        if conn: conn.close()

@actions_bp.route('/update_chosen_plans/<unique_id>', methods=['POST'])
def update_chosen_plans(unique_id):
    data = request.get_json()
    selected_plans = data.get('selected_plans')
    conn = None
    if not selected_plans:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('UPDATE submissions SET plans_chosen = NULL, supervisor_approval_status = ? WHERE unique_id = ?', ('OPEN', unique_id))
            conn.commit()
            return jsonify({'success': True, 'message': 'Cleared chosen plans; supervisor status set to OPEN.'}), 200
        except Exception as e:
            if conn: conn.rollback()
            current_app.logger.error(f"Database error while clearing chosen plans for {unique_id}: {e}")
            return jsonify({'error': 'Database update failed.'}), 500
        finally:
            if conn: conn.close()

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE submissions SET plans_chosen = ? WHERE unique_id = ?', (json.dumps(selected_plans), unique_id))
        conn.commit()
        if cursor.rowcount == 0:
            current_app.logger.warning(f"No rows were updated for unique_id {unique_id}. It might not exist.")
        return jsonify({'success': True, 'message': 'Chosen plans updated successfully.'}), 200
    except Exception as e:
        if conn: conn.rollback()
        current_app.logger.error(f"Database error while updating chosen plans for {unique_id}: {e}")
        return jsonify({'error': 'Database update failed.'}), 500
    finally:
        if conn: conn.close()

@actions_bp.route('/update_approval_status/<unique_id>', methods=['POST'])
def update_approval_status(unique_id):
    data = request.get_json()
    new_status = data.get('status')
    comments = (data.get('comments') or '').strip()
    # Capture actor id from header if provided (frontend should set X-User-Id from localStorage)
    actor_id = request.headers.get('X-User-Id') or 'Unknown'

    # Accept new canonical keys 'sup_approved' and 'sup_rejected' as well
    if new_status not in ['approved', 'rejected', 'sup_approved', 'sup_rejected', 'SUP_REVIEW', 'sup_review', 'Sup_Review', 'OPEN', 'open', 'Open']:
        return jsonify({'error': 'Invalid status'}), 400

    # Require comments for approvals/rejections (legacy and new keys)
    if new_status and str(new_status).lower() in ['approved', 'rejected', 'sup_approved', 'sup_rejected'] and not comments:
        return jsonify({'error': 'Supervisor comments are required.'}), 400
    elif new_status and str(new_status).lower() == 'sup_review' and not comments:
        comments = 'Submitted by agent; awaiting supervisor review.'

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Also track modification metadata (IST time and actor id)
        import pytz
        ist = pytz.timezone('Asia/Kolkata')
        supervisor_modified_at = datetime.now(ist).isoformat()
        cursor.execute(
            'UPDATE submissions SET supervisor_approval_status = ?, supervisor_comments = ?, supervisor_modified_at = ?, supervisor_modified_by = ? WHERE unique_id = ?',
            (new_status.upper() if new_status else None, comments, supervisor_modified_at, actor_id, unique_id)
        )
        # Recompute final_* rollup after supervisor decision
        try:
            _recompute_final_for(conn, unique_id)
        except Exception:
            pass
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Submission not found'}), 404
        return jsonify({'success': True, 'message': f'Status updated to {new_status}.', 'supervisor_comments': comments, 'supervisor_modified_at': supervisor_modified_at, 'supervisor_modified_by': actor_id}), 200
    except Exception as e:
        if conn: conn.rollback()
        current_app.logger.error(f"Database error while updating approval status for {unique_id}: {e}")
        return jsonify({'error': 'Database update failed.'}), 500
    finally:
        if conn: conn.close()

@actions_bp.route('/supervisor_selected_plans/<unique_id>', methods=['POST'])
def update_supervisor_selected_plans(unique_id):
    """Save supervisor selected plans to database"""
    data = request.get_json()
    selected_plans = data.get('selected_plans')
    
    if not selected_plans:
        return jsonify({'error': 'No selected plans provided'}), 400
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Save supervisor selected plans as JSON string
        cursor.execute(
            'UPDATE submissions SET supervisor_selected_plans = ? WHERE unique_id = ?',
            (json.dumps(selected_plans), unique_id)
        )
        
        conn.commit()
        if cursor.rowcount == 0:
            current_app.logger.warning(f"No rows were updated for unique_id {unique_id}. It might not exist.")
            return jsonify({'error': 'Submission not found'}), 404
            
        current_app.logger.info(f"Successfully saved supervisor selected plans for {unique_id}: {selected_plans}")
        return jsonify({'success': True, 'message': 'Supervisor selected plans saved successfully.'}), 200
        
    except Exception as e:
        if conn: 
            conn.rollback()
        current_app.logger.error(f"Database error while saving supervisor selected plans for {unique_id}: {e}")
        return jsonify({'error': 'Database update failed.'}), 500
    finally:
        if conn: 
            conn.close()

# --- Utility endpoint: log plan selection summary to server terminal ---
@actions_bp.route('/log_plan_summary/<unique_id>', methods=['POST'])
def log_plan_selection_summary(unique_id):
    """Accepts a JSON payload with the plan selection summary and logs it.
    This is intended for debugging/inspection from the Analysis Dashboard UI.
    """
    try:
        payload = request.get_json(silent=True) or {}

        # Extract structures from payload
        proposed = payload.get('proposed') or {}
        agent_selected = set(payload.get('agent_selected') or [])
        supervisor_selected = set(payload.get('supervisor_selected') or [])
        client_agreed = set(payload.get('client_agreed') or payload.get('client_selected') or [])

        # 1) Pretty JSON for reference
        pretty = json.dumps(payload, indent=2, ensure_ascii=False)
        print(f"\n[PlanSummary JSON][{unique_id}]\n{pretty}\n")

        # 2) Build grouped ASCII table with 4 columns
        # Columns: System proposed plans | Agent Selected plans | Supervisor approved plans | Client Agreed plan(s)
        COLS = [
            'System proposed plans',
            'Agent proposed plans',
            'Supervisor approved plans',
            'Client Agreed plan(s)'
        ]

        # Collect rows per group
        rows = []
        # Ensure Family first if present
        ordered_keys = list(proposed.keys())
        if 'comprehensive_cover' in ordered_keys:
            ordered_keys.remove('comprehensive_cover')
            ordered_keys = ['comprehensive_cover'] + ordered_keys

        def tick(name_set, plan_name):
            return '✓' if plan_name in name_set else '✗'

        for key in ordered_keys:
            info = proposed.get(key) or {}
            section_name = info.get('name') or ('Family' if key == 'comprehensive_cover' else key)
            plans = info.get('plans') or []

            # Section header row
            rows.append([section_name, '', '', ''])

            # Plan rows
            for plan_name in plans:
                agent_cell = tick(agent_selected, plan_name)
                sup_cell = tick(supervisor_selected, plan_name)
                client_cell = tick(client_agreed, plan_name) if client_agreed else ''
                rows.append([plan_name, agent_cell, sup_cell, client_cell])

        # Compute column widths
        widths = [len(h) for h in COLS]
        for r in rows:
            for i, cell in enumerate(r):
                widths[i] = max(widths[i], len(str(cell)))

        def sep(char='-'):
            return '+' + '+'.join(char * (w + 2) for w in widths) + '+'

        def fmt_row(vals):
            return '|' + '|'.join(f" {str(val).ljust(widths[i])} " for i, val in enumerate(vals)) + '|'

        table_lines = []
        table_lines.append(sep('='))
        table_lines.append(fmt_row(COLS))
        table_lines.append(sep('='))
        for r in rows:
            table_lines.append(fmt_row(r))
            table_lines.append(sep())

        table = '\n'.join(table_lines)
        print(f"[PlanSummary TABLE][{unique_id}]\n{table}\n")
        try:
            current_app.logger.info(f"[PlanSummary TABLE][{unique_id}]\n{table}")
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': 'Plan summary logged on server.',
            'unique_id': unique_id
        }), 200
    except Exception as e:
        try:
            current_app.logger.error(f"Failed to log plan summary for {unique_id}: {e}")
        except Exception:
            pass
        return jsonify({'error': 'Failed to log plan summary.'}), 500

# ---------------- Plan Summary JSON storage API ----------------
import os

def _plan_summary_dir():
    base = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'plan_summaries')
    if not os.path.isdir(base):
        try: os.makedirs(base, exist_ok=True)
        except Exception: pass
    return base

def _plan_summary_path(uid: str) -> str:
    safe = ''.join(c for c in str(uid) if c.isalnum() or c in ('-', '_'))
    return os.path.join(_plan_summary_dir(), f"{safe}.plans.json")

def _read_plan_summary(uid: str) -> dict:
    path = _plan_summary_path(uid)
    if not os.path.isfile(path):
        return { 'unique_id': uid, 'proposed': {}, 'agent_selected': [], 'supervisor_selected': [], 'client_agreed': [] }
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return { 'unique_id': uid, 'proposed': {}, 'agent_selected': [], 'supervisor_selected': [], 'client_agreed': [] }

def _atomic_write_json(path: str, data: dict):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

@actions_bp.route('/plan_summary/<unique_id>', methods=['GET'])
def get_plan_summary(unique_id):
    data = _read_plan_summary(unique_id)
    return jsonify(data), 200

@actions_bp.route('/plan_summary/<unique_id>/init_or_update', methods=['POST'])
def init_or_update_plan_summary(unique_id):
    """Initialize or update the 'proposed' map and optionally the agent selections.
    Expected JSON: { proposed: {key:{name,plans:[]},...}, agent_selected?: [] }
    """
    payload = request.get_json(silent=True) or {}
    proposed = payload.get('proposed') or {}
    agent_selected = payload.get('agent_selected')
    data = _read_plan_summary(unique_id)
    if isinstance(proposed, dict):
        data['proposed'] = proposed
    if isinstance(agent_selected, list):
        data['agent_selected'] = agent_selected
    try:
        _atomic_write_json(_plan_summary_path(unique_id), data)
        return jsonify({ 'success': True, 'data': data }), 200
    except Exception as e:
        current_app.logger.error(f"Failed to init/update plan summary for {unique_id}: {e}")
        return jsonify({ 'error': 'failed to write plan summary' }), 500

@actions_bp.route('/plan_summary/<unique_id>/agent', methods=['PATCH'])
def patch_plan_summary_agent(unique_id):
    payload = request.get_json(silent=True) or {}
    selected = payload.get('agent_selected') or []
    data = _read_plan_summary(unique_id)
    data['agent_selected'] = list(selected)
    try:
        _atomic_write_json(_plan_summary_path(unique_id), data)
        return jsonify({ 'success': True }), 200
    except Exception as e:
        current_app.logger.error(f"Failed to patch agent for {unique_id}: {e}")
        return jsonify({ 'error': 'failed to write' }), 500

@actions_bp.route('/plan_summary/<unique_id>/supervisor', methods=['PATCH'])
def patch_plan_summary_supervisor(unique_id):
    payload = request.get_json(silent=True) or {}
    selected = payload.get('supervisor_selected') or []
    data = _read_plan_summary(unique_id)
    data['supervisor_selected'] = list(selected)
    try:
        _atomic_write_json(_plan_summary_path(unique_id), data)
        return jsonify({ 'success': True }), 200
    except Exception as e:
        current_app.logger.error(f"Failed to patch supervisor for {unique_id}: {e}")
        return jsonify({ 'error': 'failed to write' }), 500

@actions_bp.route('/plan_summary/<unique_id>/client', methods=['PATCH'])
def patch_plan_summary_client(unique_id):
    payload = request.get_json(silent=True) or {}
    selected = payload.get('client_agreed') or []
    data = _read_plan_summary(unique_id)
    data['client_agreed'] = list(selected)
    try:
        _atomic_write_json(_plan_summary_path(unique_id), data)
        return jsonify({ 'success': True }), 200
    except Exception as e:
        current_app.logger.error(f"Failed to patch client for {unique_id}: {e}")
        return jsonify({ 'error': 'failed to write' }), 500

@actions_bp.route('/api/agent/active_plans', methods=['GET'])
def get_active_plans():
    """
    Get all active plans from the features table.
    
    Returns:
        JSON object with list of active plan names:
        {
            "plans": ["Plan A", "Plan B", "Plan C", ...],
            "count": 3
        }
    """
    conn = None
    try:
        conn = get_derived_db_connection()
        cursor = conn.cursor()
        
        # Check which columns exist
        cursor.execute('PRAGMA table_info(features)')
        available_cols = {row[1] for row in cursor.fetchall()}
        
        # Determine the plan name column
        plan_col = 'Plan_Name' if 'Plan_Name' in available_cols else 'Plan Name'
        
        # Query for active plans only
        # Status is stored as lowercase 'active' based on update_plan_status
        if 'Status' in available_cols:
            cursor.execute(f'''
                SELECT DISTINCT "{plan_col}" 
                FROM features 
                WHERE LOWER(Status) = 'active'
                ORDER BY "{plan_col}"
            ''')
        else:
            # If no Status column, return all plans
            cursor.execute(f'''
                SELECT DISTINCT "{plan_col}" 
                FROM features 
                ORDER BY "{plan_col}"
            ''')
        
        rows = cursor.fetchall()
        plans = [row[0] for row in rows if row[0]]
        
        return jsonify({
            'plans': plans,
            'count': len(plans)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching active plans: {e}")
        return jsonify({'error': 'Failed to fetch active plans', 'details': str(e)}), 500
    finally:
        if conn:
            conn.close()
