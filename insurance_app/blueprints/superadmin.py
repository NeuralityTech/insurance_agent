import os
from flask import Blueprint, render_template, jsonify, request, current_app
from ..database import (
    get_user_db_connection,
    get_db_connection,
    get_application_status_db_connection,
)

superadmin_bp = Blueprint('superadmin_bp', __name__)

@superadmin_bp.route('/superadmin/dashboard')
def superadmin_dashboard():
    return render_template('Superadmin_Dashboard.html')

@superadmin_bp.route('/superadmin/create_user')
def create_user_page():
    return render_template('Create_User.html')

@superadmin_bp.route('/superadmin/update_user')
def update_user_page():
    return render_template('Update_User.html')

@superadmin_bp.route('/superadmin/cleanup_databases', methods=['GET'])
def cleanup_databases_page():
    return render_template('Clean_Databases.html')

@superadmin_bp.route('/superadmin/cleanup_databases', methods=['POST'])
def cleanup_databases_action():
    selected = request.form.getlist('databases')
    messages = []

    if not selected:
        return render_template(
            'Clean_Databases.html',
            error_message='Please select at least one database to clean.',
        )

    if 'insurance_form' in selected:
        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            # Must delete child records (comments_noted) before parent records (submissions)
            # to avoid foreign key constraint failures.
            cursor.execute('DELETE FROM comments_noted')
            cursor.execute('DELETE FROM submissions')
            conn.commit()
            messages.append('Cleared all data from insurance_form.db.')

            # Also clear the justification_reports directory
            try:
                base_dir = os.path.abspath(os.path.join(current_app.root_path, '..', 'justification_reports'))
                if os.path.exists(base_dir):
                    for filename in os.listdir(base_dir):
                        file_path = os.path.join(base_dir, filename)
                        if os.path.isfile(file_path):
                            os.unlink(file_path)
                    messages.append('Emptied justification_reports folder.')
            except Exception as e:
                messages.append(f'Error clearing reports folder: {e}')

        except Exception as e:
            return render_template(
                'Clean_Databases.html',
                error_message=f'Error cleaning insurance_form.db: {e}',
            )
        finally:
            if conn:
                conn.close()

    if 'application_status' in selected:
        conn = None
        try:
            conn = get_application_status_db_connection()
            cursor = conn.cursor()
            cursor.execute('DELETE FROM application_status_log')
            # Reset auto-increment counters
            cursor.execute("DELETE FROM sqlite_sequence WHERE name='application_status_log'")
            conn.commit()
            messages.append('Cleared all data from Application_Status.db.')
        except Exception as e:
            return render_template(
                'Clean_Databases.html',
                error_message=f'Error cleaning Application_Status.db: {e}',
            )
        finally:
            if conn:
                conn.close()

    success_message = ' '.join(messages) if messages else 'No databases were cleaned.'
    return render_template('Clean_Databases.html', success_message=success_message)

@superadmin_bp.route('/api/get_user/<user_id>', methods=['GET'])
def get_user(user_id):
    conn = None
    try:
        conn = get_user_db_connection()
        cursor = conn.cursor()
        user_data = None
        for role in ['Admin', 'Supervisor', 'Agent']:
            cursor.execute(f'SELECT * FROM {role} WHERE user_id = ?', (user_id,))
            user = cursor.fetchone()
            if user:
                user_data = dict(user)
                user_data['role'] = role.lower()
                if 'password' in user_data:
                    del user_data['password']
                break
        if user_data:
            return jsonify(user_data), 200
        else:
            return jsonify({'error': 'User not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()
