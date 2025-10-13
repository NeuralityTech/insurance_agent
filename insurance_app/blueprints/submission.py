import json
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from ..database import get_db_connection
from ..analysis.query_fetcher import generate, clean_and_parse
from ..analysis.get_plans import fetch_plans
# Temporarily commented out to avoid import issues
# from ..utils.timestamp_utils import get_current_timestamp_iso, get_current_timestamp_formatted

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

@submission_bp.route('/submission/<unique_id>/meta', methods=['GET'])
def get_submission_meta(unique_id):
    """Return supervisor status and comments for a submission.

    Response JSON:
    { "supervisor_status": "approved|SUP_REVIEW|rejected|OPEN",
      "supervisor_comments": "..." | null,
      "supervisor_modified_at": "ISO timestamp or null",
      "supervisor_modified_by": "user id or null" }
    """
    conn = get_db_connection()
    # Select all columns to be compatible with legacy/new schemas (timestamp/agent vs created_at/created_by)
    row = conn.execute(
        'SELECT * FROM submissions WHERE unique_id = ?',
        (unique_id,)
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Submission not found.'}), 404

    # Safely resolve supervisor status/comments (support schemas where columns may be absent)
    status = (
        row['supervisor_approval_status']
        if ('supervisor_approval_status' in row.keys() and row['supervisor_approval_status'])
        else 'OPEN'
    )
    comments = (
        row['supervisor_comments']
        if ('supervisor_comments' in row.keys() and row['supervisor_comments'])
        else None
    )
    modified_at = row['supervisor_modified_at'] if 'supervisor_modified_at' in row.keys() else None
    modified_by = row['supervisor_modified_by'] if 'supervisor_modified_by' in row.keys() else None
    # Map legacy created fields to existing schema: timestamp -> created_at, agent -> created_by
    # created_at = row['timestamp'] if 'timestamp' in row.keys() else None
    # created_by = row['agent'] if 'agent' in row.keys() else None
    created_at = row['created_at'] if 'created_at' in row.keys() else None
    created_by = row['created_by'] if 'created_by' in row.keys() else None

    return jsonify({
        'supervisor_status': status,
        'supervisor_comments': comments,
        'supervisor_modified_at': modified_at,
        'supervisor_modified_by': modified_by,
        'created_at': created_at,
        'created_by': created_by
    }), 200

@submission_bp.route('/submit', methods=['POST'])
def submit_form():
    try:
        payload = request.get_json()
        current_app.logger.info("Received submit payload keys: %s", list(payload.keys()) if payload else 'None')
        
        if not payload:
            return jsonify({'error': 'Invalid JSON payload.'}), 400
            
        user_id = payload.get('userId')
        form_data = payload.get('formData')
        
        if not form_data:
            return jsonify({'error': 'Form data is required.'}), 400
            
        # Extract required fields with better error messages
        unique_id = form_data.get('unique_id')
        applicant_name = form_data.get('applicant_name')
        
        if not unique_id:
            return jsonify({'error': 'Unique ID is required.'}), 400
        if not applicant_name:
            return jsonify({'error': 'Applicant name is required.'}), 400
            
        # Validate unique_id format
        if not unique_id.strip() or len(unique_id.strip()) < 3:
            return jsonify({'error': 'Invalid Unique ID format.'}), 400
            
        # Validate applicant_name
        if not applicant_name.strip() or len(applicant_name.strip()) < 2:
            return jsonify({'error': 'Invalid applicant name.'}), 400
    
    except Exception as e:
        current_app.logger.error(f"Error processing submit request: {e}")
        return jsonify({'error': 'Invalid request format.'}), 400

    unique_id = form_data['unique_id']
    applicant_name = form_data['applicant_name']
    # Use IST timezone for timestamps
    import pytz
    ist = pytz.timezone('Asia/Kolkata')
    now_ist = datetime.now(ist)
    timestamp = now_ist.isoformat()
    created_at_str = now_ist.strftime('%Y-%m-%d_%H-%M-%S')
    agent = user_id or 'Unknown'
    form_summary = json.dumps(form_data)

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Start transaction
        conn.execute('BEGIN IMMEDIATE')
        
        # Check if submission exists
        exists = cursor.execute('SELECT unique_id, form_summary FROM submissions WHERE unique_id = ?', (unique_id,)).fetchone()
        
        # Validate form_summary JSON before saving
        try:
            json.loads(form_summary)
        except json.JSONDecodeError as e:
            current_app.logger.error(f"Invalid JSON in form_summary for {unique_id}: {e}")
            conn.rollback()
            return jsonify({'error': 'Invalid form data format.'}), 400
        
        if exists:
            current_app.logger.info("Updating submission: %s", unique_id)
            # Update mutable fields and set modification timestamps
            cursor.execute(
                '''UPDATE submissions SET full_name = ?, timestamp = ?, agent = ?, form_summary = ?, 
                   application_modified_at = ?, application_modified_by = ? WHERE unique_id = ?''',
                (applicant_name, timestamp, agent, form_summary, timestamp, agent, unique_id)
            )
            message = 'Submission updated successfully.'
            status_code = 200
        else:
            current_app.logger.info("Creating new submission: %s", unique_id)
            # For new submissions, set created_at to requested string format and created_by to the user id
            cursor.execute(
                '''INSERT INTO submissions (unique_id, full_name, timestamp, agent, form_summary, supervisor_approval_status, first_created_at, first_created_by, application_modified_at, application_modified_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (unique_id, applicant_name, timestamp, agent, form_summary, 'OPEN', created_at_str, agent, timestamp, agent)
            )
            message = 'Submission created successfully.'
            status_code = 201
        
        # Commit transaction
        conn.commit()
        current_app.logger.info("Successfully %s submission: %s", "updated" if exists else "created", unique_id)
            
    except Exception as db_error:
        current_app.logger.error(f"Database error for submission {unique_id}: {db_error}")
        if conn:
            try:
                conn.rollback()
            except:
                pass
        return jsonify({'error': 'Database error occurred. Please try again.'}), 500
    finally:
        if conn:
            conn.close()

    # Run analysis pipeline
    try:
        derived_text = generate(form_summary)
        current_app.logger.info("Raw derived output: %s", derived_text)
        derived = clean_and_parse(derived_text)
        plans = fetch_plans(derived, form_data)
        current_app.logger.info("Computed plans: %s", plans)

        # Insert proposed plans into the new table
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                'INSERT OR REPLACE INTO Proposed_Selected_Plans (unique_id, system_plans_before_ailment_score) VALUES (?, ?)',
                (unique_id, json.dumps(plans))
            )
            conn.commit()
        except Exception as db_error:
            current_app.logger.error(f"Database error for Proposed_Selected_Plans {unique_id}: {db_error}")
        finally:
            if conn:
                conn.close()

        return jsonify({'submissionId': unique_id, 'message': message, 'plans': plans}), status_code
    except Exception as e:
        current_app.logger.error(f"Analysis pipeline failed for {unique_id}: {e}")
        return jsonify({'submissionId': unique_id, 'message': message + ' Plan analysis failed.', 'plans': []}), status_code

@submission_bp.route('/submission/<unique_id>/comments', methods=['GET'])
def get_comments(unique_id):
    """Get all comments for a submission."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            'SELECT modifier, comment, timestamp FROM comments_noted WHERE unique_id = ? ORDER BY timestamp DESC',
            (unique_id,)
        ).fetchall()
        comments = [{'modifier': row['modifier'], 'comment': row['comment'], 'timestamp': row['timestamp']} for row in rows]
        return jsonify({'comments': comments}), 200
    finally:
        conn.close()

@submission_bp.route('/submission/<unique_id>/comments', methods=['POST'])
def add_comment(unique_id):
    """Add a new comment to a submission."""
    data = request.get_json()
    if not data or 'comment' not in data or 'modifier' not in data:
        return jsonify({'error': 'Comment and modifier are required'}), 400
    
    comment = data['comment'].strip()
    modifier = data['modifier'].strip()
    
    if not comment or not modifier:
        return jsonify({'error': 'Comment and modifier cannot be empty'}), 400
    
    # Generate timestamp in ISO format
    import pytz
    ist = pytz.timezone('Asia/Kolkata')
    now_ist = datetime.now(ist)
    timestamp = now_ist.isoformat()
    
    conn = get_db_connection()
    try:
        # Check if submission exists
        submission = conn.execute('SELECT unique_id FROM submissions WHERE unique_id = ?', (unique_id,)).fetchone()
        if not submission:
            # Create a basic submission entry if it doesn't exist
            # Extract name from unique_id (format: Name_PhoneNumber)
            try:
                name_part = unique_id.split('_')[0] if '_' in unique_id else unique_id
                current_app.logger.info(f"Creating basic submission entry for {unique_id}")
                
                # Create minimal submission entry to allow comments
                conn.execute(
                    '''INSERT INTO submissions (unique_id, full_name, timestamp, agent, form_summary, supervisor_approval_status, first_created_at, first_created_by, application_modified_at, application_modified_by)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (unique_id, name_part, timestamp, modifier, '{}', 'OPEN', now_ist.strftime('%Y-%m-%d_%H-%M-%S'), modifier, timestamp, modifier)
                )
                current_app.logger.info(f"Created basic submission entry for {unique_id}")
            except Exception as e:
                current_app.logger.error(f"Failed to create basic submission for {unique_id}: {e}")
                return jsonify({'error': 'Failed to create submission entry for comments'}), 500
        
        # Insert comment
        conn.execute(
            'INSERT INTO comments_noted (unique_id, modifier, comment, timestamp) VALUES (?, ?, ?, ?)',
            (unique_id, modifier, comment, timestamp)
        )
        conn.commit()
        
        return jsonify({
            'message': 'Comment added successfully',
            'comment': {
                'modifier': modifier,
                'comment': comment,
                'timestamp': timestamp
            }
        }), 201
    finally:
        conn.close()
