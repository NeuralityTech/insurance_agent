import json
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from ..database import get_db_connection
from ..analysis.query_fetcher import generate, clean_and_parse
from ..analysis.get_plans import fetch_plans

submission_bp = Blueprint('submission_bp', __name__)

@submission_bp.route('/submission/<unique_id>', methods=['GET'])
def get_submission(unique_id):
    conn = get_db_connection()
    row = conn.execute('SELECT form_summary FROM submissions WHERE unique_id = ?', (unique_id,)).fetchone()
    conn.close()
    if row:
        data = json.loads(row['form_summary'])
        return jsonify(data), 200
    return jsonify({'error': 'Submission not found.'}), 404

@submission_bp.route('/submit', methods=['POST'])
def submit_form():
    payload = request.get_json()
    current_app.logger.info("Received submit payload: %s", payload)
    if not payload:
        return jsonify({'error': 'Invalid JSON.'}), 400
    user_id = payload.get('userId')
    form_data = payload.get('formData')
    if not form_data or not form_data.get('unique_id') or not form_data.get('applicant_name'):
        return jsonify({'error': 'Form data, Unique ID, and Full Name are required.'}), 400

    unique_id = form_data['unique_id']
    applicant_name = form_data['applicant_name']
    timestamp = datetime.utcnow().isoformat()
    agent = user_id or 'Unknown'
    form_summary = json.dumps(form_data)

    conn = get_db_connection()
    cursor = conn.cursor()
    exists = cursor.execute('SELECT unique_id FROM submissions WHERE unique_id = ?', (unique_id,)).fetchone()
    if exists:
        current_app.logger.info("Updating submission: %s", unique_id)
        cursor.execute(
            '''UPDATE submissions SET full_name = ?, timestamp = ?, agent = ?, form_summary = ? WHERE unique_id = ?''',
            (applicant_name, timestamp, agent, form_summary, unique_id)
        )
        conn.commit()
        conn.close()

        try:
            derived_text = generate(form_summary)
            current_app.logger.info("Raw derived output: %s", derived_text)
            derived = clean_and_parse(derived_text)
            plans = fetch_plans(derived)
            current_app.logger.info("Computed plans: %s", plans)
            return jsonify({'submissionId': unique_id, 'message': 'Submission updated successfully.', 'plans': plans}), 200
        except Exception as e:
            current_app.logger.error(f"Analysis pipeline failed after update for {unique_id}: {e}")
            return jsonify({'submissionId': unique_id, 'message': 'Submission updated. Plan analysis failed.', 'plans': []}), 200
    else:
        current_app.logger.info("Creating new submission: %s", unique_id)
        cursor.execute(
            '''INSERT INTO submissions (unique_id, full_name, timestamp, agent, form_summary, supervisor_approval_status) VALUES (?, ?, ?, ?, ?, ?)''',
            (unique_id, applicant_name, timestamp, agent, form_summary, 'NA')
        )
        conn.commit()
        conn.close()

        try:
            derived_text = generate(form_summary)
            current_app.logger.info("Raw derived output: %s", derived_text)
            derived = clean_and_parse(derived_text)
            plans = fetch_plans(derived)
            current_app.logger.info("Computed plans: %s", plans)
            return jsonify({'submissionId': unique_id, 'message': 'Submission created successfully.', 'plans': plans}), 201
        except Exception as e:
            current_app.logger.error(f"Analysis pipeline failed after create for {unique_id}: {e}")
            return jsonify({'submissionId': unique_id, 'message': 'Submission created. Plan analysis failed.', 'plans': []}), 201
