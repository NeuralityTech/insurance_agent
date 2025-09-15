import json
from flask import Blueprint, request, jsonify, current_app
from ..database import get_db_connection, get_derived_db_connection

actions_bp = Blueprint('actions_bp', __name__)

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
            cursor.execute('UPDATE submissions SET plans_chosen = NULL, supervisor_approval_status = ? WHERE unique_id = ?', ('NA', unique_id))
            conn.commit()
            return jsonify({'success': True, 'message': 'Cleared chosen plans; supervisor status set to NA.'}), 200
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

    if new_status not in ['approved', 'rejected', 'pending', 'NA', 'na', 'Na', 'nA']:
        return jsonify({'error': 'Invalid status'}), 400

    if new_status and str(new_status).lower() in ['approved', 'rejected'] and not comments:
        return jsonify({'error': 'Supervisor comments are required.'}), 400
    elif new_status and str(new_status).lower() == 'pending' and not comments:
        comments = 'Resubmitted by agent; awaiting supervisor review.'

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE submissions SET supervisor_approval_status = ?, supervisor_comments = ? WHERE unique_id = ?', (new_status.upper() if new_status else None, comments, unique_id))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Submission not found'}), 404
        return jsonify({'success': True, 'message': f'Status updated to {new_status}.', 'supervisor_comments': comments}), 200
    except Exception as e:
        if conn: conn.rollback()
        current_app.logger.error(f"Database error while updating approval status for {unique_id}: {e}")
        return jsonify({'error': 'Database update failed.'}), 500
    finally:
        if conn: conn.close()
