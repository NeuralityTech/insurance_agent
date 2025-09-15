from flask import Blueprint, render_template, jsonify
from ..database import get_user_db_connection

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
