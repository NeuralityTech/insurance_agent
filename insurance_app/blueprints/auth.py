from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import check_password_hash
from ..database import get_user_db_connection

auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    userId = data.get('userId')
    password = data.get('password')
    role = data.get('role')

    if not all([userId, password, role]):
        return jsonify({'error': 'Missing credentials'}), 400

    role_to_table = {
        'agent': 'Agent',
        'supervisor': 'Supervisor',
        'admin': 'Admin',
        'superadmin': 'SuperAdmin'
    }

    table_name = role_to_table.get(role)
    if not table_name:
        return jsonify({'error': 'Invalid role specified'}), 400

    conn = None
    try:
        conn = get_user_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(f'SELECT * FROM {table_name} WHERE user_id = ?', (userId,))
        user = cursor.fetchone()

        if user and check_password_hash(user['password'], password):
            current_app.logger.info(f"User '{userId}' logged in successfully as '{role}'.")
            return jsonify({'success': True}), 200
        else:
            current_app.logger.warning(f"Failed login attempt for user '{userId}' as '{role}'.")
            return jsonify({'error': 'Invalid credentials'}), 401

    except Exception as e:
        current_app.logger.error(f"Database error during login: {e}")
        return jsonify({'error': 'An internal error occurred.'}), 500

    finally:
        if conn:
            conn.close()
