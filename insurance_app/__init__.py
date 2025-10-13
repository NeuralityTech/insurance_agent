import os
import logging
import base64
from flask import Flask, send_from_directory, render_template, Response, request, redirect, url_for, abort
from flask_cors import CORS
from dotenv import load_dotenv

# --- Logging Setup (early, so debug shows in Gunicorn logs) ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Load environment variables ---
load_dotenv()
key = os.environ.get("GEMINI_API_KEY")
masked = key[:4] + "..." + key[-4:] if key else "NOT SET"
logging.info(">>> DEBUG: GEMINI_API_KEY loaded: %s", masked)

def create_app():
    """Create and configure an instance of the Flask application."""
    app = Flask(__name__, instance_relative_config=True)
    CORS(app)

    # --- Configuration ---
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
    # New: append-only audit DB for Final_* changes
    app.config['APPLICATION_STATUS_DB_PATH'] = os.path.join(app.instance_path, 'Application_Status.db')

    # --- Logging for app ---
    app.logger.setLevel(logging.INFO)

    # --- Database Initialization ---
    from . import database
    with app.app_context():
        database.init_db()
        database.init_application_status_db()
        app.logger.info("Database initialized.")

    # --- Register Blueprints ---
    from .blueprints import auth, submission, analysis, dashboard, actions, superadmin, approvals
    app.register_blueprint(auth.auth_bp)
    app.register_blueprint(submission.submission_bp)
    app.register_blueprint(analysis.analysis_bp)
    app.register_blueprint(dashboard.dashboard_bp)
    app.register_blueprint(actions.actions_bp)
    app.register_blueprint(superadmin.superadmin_bp)
    app.register_blueprint(approvals.approvals_bp)
    app.logger.info("All blueprints registered.")

    # --- Static File and Root Routes ---
    @app.route('/')
    def login_page():
        return render_template('Main_login.html')

    @app.route('/html/<path:filename>')
    def serve_html(filename):
        # Redirect data-dependent templates to their dedicated routes
        if filename == 'Analysis_Dashboard.html':
            uid = request.args.get('unique_id')
            if uid:
                # Use the analysis blueprint route which prepares all required context
                return redirect(url_for('analysis_bp.get_proposed_plans', unique_id=uid), code=302)
            # No UID provided; fall through to render with safe defaults in template
        # Render templates so Jinja (e.g., url_for) is processed
        return render_template(filename)

    @app.route('/js/<path:filename>')
    def serve_js(filename):
        return send_from_directory(os.path.join(app.static_folder, 'js'), filename)

    @app.route('/css/<path:filename>')
    def serve_css(filename):
        return send_from_directory(os.path.join(app.static_folder, 'css'), filename)

    # Serve justification reports stored outside static: ../justification_reports/<client_id>.json
    @app.route('/justification_reports/<client_id>.json')
    def serve_justification_report(client_id):
        try:
            # app.root_path -> .../insurance_app ; go one level up and into justification_reports
            base_dir = os.path.abspath(os.path.join(app.root_path, '..', 'justification_reports'))
            filename = f'{client_id}.json'
            file_path = os.path.join(base_dir, filename)
            if not os.path.isfile(file_path):
                return abort(404)
            return send_from_directory(base_dir, filename, mimetype='application/json')
        except Exception:
            return abort(404)

    @app.route('/favicon.ico')
    def favicon():
        # Serve favicon from static if present; otherwise return a tiny transparent PNG to avoid 404s
        ico_path = os.path.join(app.static_folder or '', 'favicon.ico')
        try:
            if app.static_folder and os.path.exists(ico_path):
                return send_from_directory(app.static_folder, 'favicon.ico', mimetype='image/vnd.microsoft.icon')
        except Exception:
            pass
        # 1x1 transparent PNG (base64)
        transparent_png_b64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
        )
        png_bytes = base64.b64decode(transparent_png_b64)
        return Response(png_bytes, mimetype='image/png')

    return app

