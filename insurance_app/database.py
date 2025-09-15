import sqlite3
from flask import current_app

def get_db_connection():
    conn = sqlite3.connect(current_app.config['DATABASE_PATH'])
    conn.row_factory = sqlite3.Row
    return conn

def get_derived_db_connection():
    conn = sqlite3.connect(current_app.config['DERIVED_DB_PATH'])
    conn.row_factory = sqlite3.Row
    return conn

def get_user_db_connection():
    conn = sqlite3.connect(current_app.config['USER_DB_PATH'])
    conn.row_factory = sqlite3.Row
    return conn

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

    # Check and add 'plans_chosen' column
    cursor.execute("PRAGMA table_info(submissions)")
    columns = [info[1] for info in cursor.fetchall()]
    if 'plans_chosen' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN plans_chosen TEXT")

    # Check and add 'supervisor_approval_status' column
    if 'supervisor_approval_status' not in columns:
        cursor.execute("ALTER TABLE submissions ADD COLUMN supervisor_approval_status TEXT DEFAULT 'pending'")

    # Check and add 'supervisor_comments' column
    if 'supervisor_comments' not in columns:
        cursor.execute('ALTER TABLE submissions ADD COLUMN supervisor_comments TEXT')

    # Backfill: when plans_chosen is NULL/empty set supervisor_approval_status to 'NA'
    cursor.execute("""
        UPDATE submissions
        SET supervisor_approval_status = 'NA'
        WHERE (plans_chosen IS NULL OR TRIM(COALESCE(plans_chosen, '')) = '')
          AND (supervisor_approval_status IS NULL OR TRIM(COALESCE(supervisor_approval_status, '')) = '' OR LOWER(supervisor_approval_status) = 'pending')
    """)

    conn.commit()
    conn.close()
