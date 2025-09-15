import os
import logging
from flask import Flask, send_from_directory
from flask_cors import CORS

def create_app():
    """Create and configure an instance of the Flask application."""
    app = Flask(__name__, instance_relative_config=True)
    CORS(app)

    # --- Configuration --- 
    # Ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    # Load configurations from config.py
    app.config.from_pyfile(os.path.join(os.path.dirname(app.root_path), 'insurance_app', 'config.py'))

    # Configure database paths to point to the instance folder
    app.config['DATABASE_PATH'] = os.path.join(app.instance_path, 'insurance_form.db')
    app.config['DERIVED_DB_PATH'] = os.path.join(app.instance_path, 'derived.db')
    app.config['USER_DB_PATH'] = os.path.join(app.instance_path, 'users.db')

    # --- Logging Setup ---
    app.logger.setLevel(logging.INFO)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    # --- Database Initialization ---
    from . import database
    with app.app_context():
        database.init_db()
        app.logger.info("Database initialized.")

    # --- Register Blueprints ---
    from .blueprints import auth, submission, analysis, dashboard, actions, superadmin
    app.register_blueprint(auth.auth_bp)
    app.register_blueprint(submission.submission_bp)
    app.register_blueprint(analysis.analysis_bp)
    app.register_blueprint(dashboard.dashboard_bp)
    app.register_blueprint(actions.actions_bp)
    app.register_blueprint(superadmin.superadmin_bp)
    app.logger.info("All blueprints registered.")

    # --- Static File and Root Routes ---
    @app.route('/')
    def login_page():
        return send_from_directory(app.template_folder, 'Main_login.html')

    @app.route('/html/<path:filename>')
    def serve_html(filename):
        return send_from_directory(app.template_folder, filename)

    # Note: Static files are usually served automatically by Flask if the static_folder is set.
    # These routes are kept for explicit pathing but could be removed if not strictly needed.
    @app.route('/js/<path:filename>')
    def serve_js(filename):
        return send_from_directory(os.path.join(app.static_folder, 'js'), filename)

    @app.route('/css/<path:filename>')
    def serve_css(filename):
        return send_from_directory(os.path.join(app.static_folder, 'css'), filename)

    @app.route('/favicon.ico')
    def favicon():
        return send_from_directory(app.static_folder, 'favicon.ico', mimetype='image/vnd.microsoft.icon')

    return app
