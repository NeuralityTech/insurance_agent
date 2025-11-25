import os
from flask import Blueprint, render_template, jsonify, request, current_app
from werkzeug.security import generate_password_hash, check_password_hash
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

@superadmin_bp.route('/superadmin/profile')
def superadmin_profile():
    return render_template('Superadmin_Profile.html')

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
            try:
                cursor.execute("DELETE FROM sqlite_sequence WHERE name='application_status_log'")
            except Exception:
                pass
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

    if 'users' in selected:
        conn = None
        try:
            conn = get_user_db_connection()
            cursor = conn.cursor()
            # Only delete Supervisors and Agents. Keep Admins/Superadmins intact.
            # Must delete Agent (child) before Supervisor (parent) to satisfy FK constraints.
            for table in ['Agent', 'Supervisor']:
                cursor.execute(f'DELETE FROM {table}')
                try:
                    cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{table}'")
                except Exception:
                    pass
            conn.commit()
            messages.append('Cleared Agents and Supervisors from users.db.')
        except Exception as e:
            return render_template(
                'Clean_Databases.html',
                error_message=f'Error cleaning users.db: {e}',
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


@superadmin_bp.route('/api/supervisors', methods=['GET'])
def get_supervisors():
    conn = None
    try:
        conn = get_user_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT user_id, name FROM Supervisor')
        supervisors = cursor.fetchall()
        return jsonify([dict(row) for row in supervisors]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@superadmin_bp.route('/api/create_user', methods=['POST'])
def create_user_api():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    name = data.get('name')
    user_id = data.get('user_id')
    password = data.get('password')
    gender = data.get('gender')
    phone_number = data.get('phone_number')
    role = data.get('role')
    supervisor_id = data.get('supervisor_id')

    if not all([name, user_id, password, gender, phone_number, role]):
        return jsonify({'error': 'Missing required fields'}), 400

    role_map = {
        'admin': 'Admin',
        'supervisor': 'Supervisor',
        'agent': 'Agent'
    }

    table = role_map.get(role.lower())
    if not table:
        return jsonify({'error': 'Invalid role'}), 400

    if role.lower() == 'agent' and not supervisor_id:
        return jsonify({'error': 'Supervisor is required for Agent role'}), 400

    conn = None
    try:
        conn = get_user_db_connection()
        cursor = conn.cursor()

        # Check if user_id already exists
        for t in ['Admin', 'Supervisor', 'Agent', 'SuperAdmin']:
            # Check if table exists first to avoid error if SuperAdmin table is missing (unlikely but safe)
            try:
                cursor.execute(f'SELECT 1 FROM {t} WHERE user_id = ?', (user_id,))
                if cursor.fetchone():
                    return jsonify({'error': f'User ID {user_id} already exists'}), 400
            except Exception:
                pass

        hashed_password = generate_password_hash(password)

        if role.lower() == 'agent':
            cursor.execute('''
                INSERT INTO Agent (user_id, password, name, gender, phone_number, supervisor_id)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (user_id, hashed_password, name, gender, phone_number, supervisor_id))
        else:
             cursor.execute(f'''
                INSERT INTO {table} (user_id, password, name, gender, phone_number)
                VALUES (?, ?, ?, ?, ?)
            ''', (user_id, hashed_password, name, gender, phone_number))

        conn.commit()
        return jsonify({'message': 'User created successfully'}), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@superadmin_bp.route('/api/change_password', methods=['POST'])
def change_password():
    data = request.get_json()
    user_id = data.get('user_id')
    current_password = data.get('current_password')
    new_password = data.get('new_password')

    if not all([user_id, current_password, new_password]):
        return jsonify({'error': 'Missing required fields'}), 400

    conn = None
    try:
        conn = get_user_db_connection()
        cursor = conn.cursor()
        
        # Verify current password. Check SuperAdmin table first.
        cursor.execute('SELECT password FROM SuperAdmin WHERE user_id = ?', (user_id,))
        user = cursor.fetchone()

        if not user:
            return jsonify({'error': 'User not found'}), 404

        if not check_password_hash(user['password'], current_password):
            return jsonify({'error': 'Incorrect current password'}), 401

        new_hashed = generate_password_hash(new_password)
        cursor.execute('UPDATE SuperAdmin SET password = ? WHERE user_id = ?', (new_hashed, user_id))
        conn.commit()

        return jsonify({'message': 'Password updated successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()
