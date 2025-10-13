import os
import sqlite3
from flask import current_app



def _resolve_db_path(config_key: str, default_filename: str) -> str:
    """Resolve an absolute DB path.
    Prefers app config at `config_key`, else falls back to instance/<default_filename>.
    """
    # Prefer explicit config if provided
    cfg_path = current_app.config.get(config_key)
    if cfg_path:
        path = os.path.abspath(cfg_path)
    else:
        # Fallback to instance folder
        instance_dir = getattr(current_app, 'instance_path', None) or os.path.join(os.path.dirname(__file__), '..', 'instance')
        path = os.path.abspath(os.path.join(instance_dir, default_filename))
    try:
        current_app.logger.info("DB connect -> %s=%s", config_key, path)
    except Exception:
        pass
    return path


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys pragma for SQLite if you use FKs elsewhere
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except Exception:
        pass
    return conn


def get_db_connection():
    path = _resolve_db_path('DATABASE_PATH', 'insurance_form.db')
    return _connect(path)

def get_derived_db_connection():
    path = _resolve_db_path('DERIVED_DB_PATH', 'derived.db')
    return _connect(path)

def get_user_db_connection():
    path = _resolve_db_path('USER_DB_PATH', 'users.db')
    return _connect(path)

def get_application_status_db_connection():
    path = _resolve_db_path('APPLICATION_STATUS_DB_PATH', 'Application_Status.db')
    return _connect(path)

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS submissions (
            unique_id TEXT PRIMARY KEY,
            full_name TEXT,
            timestamp TEXT NOT NULL,
            agent TEXT,
            form_summary TEXT NOT NULL
        )
    ''')

    # Get existing columns
    cursor.execute("PRAGMA table_info(submissions)")
    columns = [info[1] for info in cursor.fetchall()]

    # Check and add 'plans_chosen' column
    if 'plans_chosen' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN plans_chosen TEXT")

    # Check and add 'supervisor_approval_status' column
    if 'supervisor_approval_status' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN supervisor_approval_status TEXT DEFAULT 'SUP_REVIEW'")

    # Check and add 'supervisor_comments' column (additive only; no table rewrite)
    if 'supervisor_comments' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN supervisor_comments TEXT")
        # Refresh columns list
        cursor.execute("PRAGMA table_info(submissions)")
        columns = [info[1] for info in cursor.fetchall()]

    # Persist supervisor selections explicitly
    if 'supervisor_selected_plans' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN supervisor_selected_plans TEXT")
        cursor.execute("PRAGMA table_info(submissions)")
        columns = [info[1] for info in cursor.fetchall()]

    #  Check and add 'client_comments' column
    if 'client_comments' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN client_comments TEXT")

        # Check and add 'underwriter_status' column
    if 'underwriter_status' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN underwriter_status TEXT")

    # Check and add 'underwriter_comments' column
    if 'underwriter_comments' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN underwriter_comments TEXT")      #Until here

    # Migration: rename created_at -> first_created_at, created_by -> first_created_by
    # Prefer RENAME COLUMN when supported; otherwise ensure new columns exist and backfill
    cursor.execute("PRAGMA table_info(submissions)")
    columns = [info[1] for info in cursor.fetchall()]
    if 'first_created_at' not in columns and 'created_at' in columns:
        try:
            cursor.execute("ALTER TABLE submissions RENAME COLUMN created_at TO first_created_at")
        except Exception:
            # Fallback: add new column if missing; backfill from old; leave old in place
            cursor.execute("ALTER TABLE submissions ADD COLUMN first_created_at TEXT")
            cursor.execute("UPDATE submissions SET first_created_at = created_at WHERE first_created_at IS NULL OR TRIM(COALESCE(first_created_at,'')) = ''")
    if 'first_created_by' not in columns and 'created_by' in columns:
        try:
            cursor.execute("ALTER TABLE submissions RENAME COLUMN created_by TO first_created_by")
        except Exception:
            cursor.execute("ALTER TABLE submissions ADD COLUMN first_created_by TEXT")
            cursor.execute("UPDATE submissions SET first_created_by = COALESCE(first_created_by, created_by)")

    # Ensure new columns exist if neither old nor new existed
    cursor.execute("PRAGMA table_info(submissions)")
    columns = [info[1] for info in cursor.fetchall()]
    if 'first_created_at' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN first_created_at TEXT")
    if 'first_created_by' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN first_created_by TEXT")

    # Track supervisor modification meta
    if 'supervisor_modified_at' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN supervisor_modified_at TEXT")
    if 'supervisor_modified_by' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN supervisor_modified_by TEXT")

    # Track underwriter modification meta
    if 'underwriter_modified_at' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN underwriter_modified_at TEXT")
    if 'underwriter_modified_by' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN underwriter_modified_by TEXT")

    # Backfill first_created_at for existing rows where it's NULL/empty with a fixed historical date (requested format)
    cursor.execute("""
        UPDATE submissions
        SET first_created_at = '2025-08-21_00-00-00'
        WHERE first_created_at IS NULL OR TRIM(COALESCE(first_created_at, '')) = ''
    """)

    # Backfill first_created_by from agent where missing
    cursor.execute("""
        UPDATE submissions
        SET first_created_by = COALESCE(first_created_by, agent)
        WHERE first_created_by IS NULL OR TRIM(COALESCE(first_created_by, '')) = ''
    """)

    # Ensure JSON paths under $.primaryContact exist in form_summary before any row updates
    # 1) If form_summary is NULL/blank, create a minimal JSON with unique_id and applicant_name
    cursor.execute("""
        UPDATE submissions
        SET form_summary = json_object(
            'primaryContact', json_object(
                'unique_id', unique_id,
                'applicant_name', COALESCE(NULLIF(full_name, ''), unique_id)
            )
        )
        WHERE form_summary IS NULL OR TRIM(COALESCE(form_summary, '')) = ''
    """)
    # 2) If JSON exists but either unique_id or applicant_name is missing/blank, set both in one pass
    cursor.execute("""
        UPDATE submissions
        SET form_summary = json_set(
            form_summary,
            '$.primaryContact.unique_id',
            COALESCE(NULLIF(json_extract(form_summary, '$.primaryContact.unique_id'), ''), unique_id),
            '$.primaryContact.applicant_name',
            COALESCE(NULLIF(json_extract(form_summary, '$.primaryContact.applicant_name'), ''), COALESCE(NULLIF(full_name, ''), unique_id))
        )
        WHERE json_extract(form_summary, '$.primaryContact') IS NOT NULL
          AND (
                json_extract(form_summary, '$.primaryContact.unique_id') IS NULL
             OR TRIM(COALESCE(json_extract(form_summary, '$.primaryContact.unique_id'), '')) = ''
             OR json_extract(form_summary, '$.primaryContact.applicant_name') IS NULL
             OR TRIM(COALESCE(json_extract(form_summary, '$.primaryContact.applicant_name'), '')) = ''
          )
    """)


    # Backfill: when plans_chosen is NULL/empty set supervisor_approval_status to 'OPEN'
    cursor.execute("""
        UPDATE submissions
        SET supervisor_approval_status = 'OPEN'
        WHERE (plans_chosen IS NULL OR TRIM(COALESCE(plans_chosen, '')) = '')
          AND (supervisor_approval_status IS NULL OR TRIM(COALESCE(supervisor_approval_status, '')) = '' OR LOWER(supervisor_approval_status) IN ('pending','sup_review'))
    """)

    # Migrate existing 'pending' values to 'SUP_REVIEW' to align with new terminology
    cursor.execute("""
        UPDATE submissions
        SET supervisor_approval_status = 'SUP_REVIEW'
        WHERE LOWER(COALESCE(supervisor_approval_status, '')) = 'pending'
    """)
    cursor.execute("""
        UPDATE submissions
        SET underwriter_status = 'SUP_REVIEW'
        WHERE LOWER(COALESCE(underwriter_status, '')) = 'pending'
    """)

    # Migrate existing 'NA' values to 'OPEN' to align with new terminology
    cursor.execute("""
        UPDATE submissions
        SET supervisor_approval_status = 'OPEN'
        WHERE UPPER(COALESCE(supervisor_approval_status, '')) = 'NA'
    """)

    # Rename supervisor decisions: 'approved' -> 'SUP_APPROVED', 'rejected' -> 'SUP_REJECTED'
    cursor.execute("""
        UPDATE submissions
        SET supervisor_approval_status = 'SUP_APPROVED'
        WHERE LOWER(COALESCE(supervisor_approval_status, '')) = 'approved'
    """)
    cursor.execute("""
        UPDATE submissions
        SET supervisor_approval_status = 'SUP_REJECTED'
        WHERE LOWER(COALESCE(supervisor_approval_status, '')) = 'rejected'
    """)
    cursor.execute("""
        UPDATE submissions
        SET underwriter_status = NULL
        WHERE UPPER(COALESCE(underwriter_status, '')) IN ('NA','OPEN') OR TRIM(COALESCE(underwriter_status,'')) = ''
    """)

    # Normalize existing underwriter rejections to new key
    cursor.execute("""
        UPDATE submissions
        SET underwriter_status = 'UW_Rejected'
        WHERE UPPER(COALESCE(underwriter_status, '')) = 'REJECTED'
    """)
    # Normalize existing underwriter approvals to new key
    cursor.execute("""
        UPDATE submissions
        SET underwriter_status = 'With_UW'
        WHERE UPPER(COALESCE(underwriter_status, '')) = 'APPROVED'
    """)

    # Migrate legacy UW_approved to With_UW
    cursor.execute("""
        UPDATE submissions
        SET underwriter_status = 'With_UW'
        WHERE underwriter_status = 'UW_approved'
    """)

    # Align any application_status carrying legacy value
    cursor.execute("""
        UPDATE submissions
        SET application_status = 'With_UW'
        WHERE application_status = 'UW_approved'
    """)

    # --- Ensure client_review (boolean-like INTEGER 0/1) exists and default unchecked (0) ---
    if 'client_review' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN client_review INTEGER DEFAULT 0")
    cursor.execute("""
        UPDATE submissions
        SET client_review = 0
        WHERE client_review IS NULL
    """)

    # --- Policy outcome fields (Agent action after With_UW) ---
    if 'policy_outcome' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_outcome TEXT")
    if 'policy_outcome_comment' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_outcome_comment TEXT")
    if 'policy_outcome_modified_at' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_outcome_modified_at TEXT")
    if 'policy_outcome_modified_by' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_outcome_modified_by TEXT")

    # --- Policy details fields (captured when Policy Created) ---
    if 'policy_number' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_number TEXT")
    if 'member_number' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN member_number TEXT")
    if 'member_name' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN member_name TEXT")
    if 'policy_start_date' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_start_date TEXT")
    if 'policy_period_months' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_period_months INTEGER")
    if 'policy_end_date' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_end_date TEXT")

    # Optional: Policy name and free-text policy details captured during creation
    if 'policy_name' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_name TEXT")
    if 'policy_details' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN policy_details TEXT")

    # Final application status and audit
    if 'close_status' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN close_status TEXT")
    if 'close_status_modified_at' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN close_status_modified_at TEXT")
    if 'close_status_modified_by' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN close_status_modified_by TEXT")
    # Store comments associated with close_status transitions
    cursor.execute("PRAGMA table_info(submissions)")
    columns = [info[1] for info in cursor.fetchall()]
    if 'close_comments' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN close_comments TEXT")
    
    # Add Client_Agreed_Plans column to store client's selected plans
    if 'Client_Agreed_Plans' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN Client_Agreed_Plans TEXT")

    # --- Final rolled-up status fields ---
    cursor.execute("PRAGMA table_info(submissions)")
    columns = [info[1] for info in cursor.fetchall()]
    if 'application_status' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN application_status TEXT")
    if 'application_comments' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN application_comments TEXT")
    if 'application_modified_at' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN application_modified_at TEXT")
    if 'application_modified_by' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN application_modified_by TEXT")

    # Backfill final_* for existing rows by picking the most recent of the four subsystems
    try:
        cursor.execute("SELECT unique_id, supervisor_approval_status, supervisor_comments, supervisor_modified_at, supervisor_modified_by, underwriter_status, underwriter_comments, underwriter_modified_at, underwriter_modified_by, policy_outcome, policy_outcome_comment, policy_outcome_modified_at, policy_outcome_modified_by, close_status, close_status_modified_at, close_status_modified_by FROM submissions")
        rows = cursor.fetchall()
        for r in rows:
            row = dict(zip([d[0] for d in cursor.description], r))
            # Collect candidates (ts, source)
            candidates = []
            for src, ts in (
                ('supervisor', row['supervisor_modified_at'] if 'supervisor_modified_at' in row.keys() and row['supervisor_modified_at'] else None),
                ('underwriter', row['underwriter_modified_at'] if 'underwriter_modified_at' in row.keys() and row['underwriter_modified_at'] else None),
                ('policy', row['policy_outcome_modified_at'] if 'policy_outcome_modified_at' in row.keys() and row['policy_outcome_modified_at'] else None),
                ('application', row['close_status_modified_at'] if 'close_status_modified_at' in row.keys() and row['close_status_modified_at'] else None),
            ):
                if ts and str(ts).strip():
                    candidates.append((str(ts), src))
            if not candidates:
                continue
            candidates.sort(key=lambda x: x[0])
            latest_ts, latest_src = candidates[-1]
            if latest_src == 'supervisor':
                f_status = row['supervisor_approval_status'] if 'supervisor_approval_status' in row.keys() and row['supervisor_approval_status'] else None
                f_comments = row['supervisor_comments'] if 'supervisor_comments' in row.keys() and row['supervisor_comments'] else None
                f_by = row['supervisor_modified_by'] if 'supervisor_modified_by' in row.keys() and row['supervisor_modified_by'] else None
            elif latest_src == 'underwriter':
                f_status = row['underwriter_status'] if 'underwriter_status' in row.keys() and row['underwriter_status'] else None
                f_comments = row['underwriter_comments'] if 'underwriter_comments' in row.keys() and row['underwriter_comments'] else None
                f_by = row['underwriter_modified_by'] if 'underwriter_modified_by' in row.keys() and row['underwriter_modified_by'] else None
            elif latest_src == 'policy':
                f_status = row['policy_outcome'] if 'policy_outcome' in row.keys() and row['policy_outcome'] else None
                f_comments = row['policy_outcome_comment'] if 'policy_outcome_comment' in row.keys() and row['policy_outcome_comment'] else None
                f_by = row['policy_outcome_modified_by'] if 'policy_outcome_modified_by' in row.keys() and row['policy_outcome_modified_by'] else None
            else:  # application
                f_status = row['close_status'] if 'close_status' in row.keys() and row['close_status'] else None
                f_comments = None
                f_by = row['close_status_modified_by'] if 'close_status_modified_by' in row.keys() and row['close_status_modified_by'] else None
            cursor.execute(
                """
                UPDATE submissions
                SET application_status = ?, application_comments = ?, application_modified_at = ?, application_modified_by = ?
                WHERE unique_id = ?
                """,
                (f_status, f_comments, latest_ts, f_by, row['unique_id'])
            )
    except Exception:
        # Non-fatal; continue initialization even if backfill fails
        pass

    # Create comments_noted table for storing individual comments
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS comments_noted (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unique_id TEXT NOT NULL,
            modifier TEXT NOT NULL,
            comment TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (unique_id) REFERENCES submissions (unique_id)
        )
    ''')
    
    # Create index for faster lookups
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_comments_noted_uid ON comments_noted(unique_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_comments_noted_timestamp ON comments_noted(timestamp DESC)')

    # Create Proposed_Selected_Plans table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Proposed_Selected_Plans (
            unique_id TEXT PRIMARY KEY,
            system_plans_before_ailment_score TEXT,
            system_plans_after_ailment_score TEXT,
            agent_selected_plans TEXT,
            agent_selection_timestamp TEXT,
            supervisor_selected_plans TEXT,
            supervisor_selection_timestamp TEXT,
            client_agreed_plans TEXT,
            client_agreement_timestamp TEXT,
            FOREIGN KEY (unique_id) REFERENCES submissions (unique_id)
        )
    ''')

    conn.commit()
    conn.close()

def init_application_status_db():
    """Initialize append-only audit database for Application_* changes."""
    conn = get_application_status_db_connection()
    cur = conn.cursor()
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS application_status_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unique_id TEXT NOT NULL,
            application_status TEXT,
            application_comments TEXT,
            application_modified_at TEXT,
            application_modified_by TEXT,
            source TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
        '''
    )
    cur.execute('CREATE INDEX IF NOT EXISTS idx_application_status_log_uid ON application_status_log(unique_id)')
    conn.commit()
    conn.close()

def insert_application_status_log_entry(unique_id: str, application_status: str, application_comments: str, application_modified_at: str, application_modified_by: str, source: str = None):
    """Insert a new log entry into Application_Status.db. Always appends; never overwrites."""
    conn = get_application_status_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            '''
            INSERT INTO application_status_log (unique_id, application_status, application_comments, application_modified_at, application_modified_by, source)
            VALUES (?, ?, ?, ?, ?, ?)
            ''',
            (unique_id, application_status, application_comments, application_modified_at, application_modified_by, source)
        )
        conn.commit()
    finally:
        conn.close()
