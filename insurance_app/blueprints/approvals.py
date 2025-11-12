#srihari
# File: (replace the file that currently contains approvals_bp, e.g. app/api/approvals.py)
from flask import Blueprint, request, jsonify, current_app
from datetime import datetime
import pytz
import json
from ..database import get_db_connection, get_application_status_db_connection, insert_application_status_log_entry
# Temporarily commented out to avoid import issues
# from ..utils.timestamp_utils import get_current_timestamp_iso

approvals_bp = Blueprint("approvals", __name__, url_prefix="/api/agent")

# --- Helper: recompute and persist final_* rollup for a submission ---
def _recompute_final_for(conn, unique_id: str):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT supervisor_approval_status, supervisor_comments, supervisor_modified_at, supervisor_modified_by,
               underwriter_status, underwriter_comments, underwriter_modified_at, underwriter_modified_by,
               policy_outcome, policy_outcome_comment, policy_outcome_modified_at, policy_outcome_modified_by,
               close_status, close_status_modified_at, close_status_modified_by, close_comments,
               application_status, application_comments, application_modified_at, application_modified_by
        FROM submissions WHERE unique_id = ?
        """,
        (unique_id,)
    )
    row = cur.fetchone()
    if not row:
        return
    cols = [
        "supervisor_approval_status","supervisor_comments","supervisor_modified_at","supervisor_modified_by",
        "underwriter_status","underwriter_comments","underwriter_modified_at","underwriter_modified_by",
        "policy_outcome","policy_outcome_comment","policy_outcome_modified_at","policy_outcome_modified_by",
        "close_status","close_status_modified_at","close_status_modified_by","close_comments",
        "application_status", "application_comments", "application_modified_at", "application_modified_by"
    ]
    d = dict(zip(cols, row))
    candidates = []
    for src, ts_key in (
        ("supervisor", "supervisor_modified_at"),
        ("underwriter", "underwriter_modified_at"),
        ("policy", "policy_outcome_modified_at"),
        ("application", "close_status_modified_at"),
        ("application", "application_modified_at"), # Also consider its own last state
    ):
        ts = d.get(ts_key)
        if ts and str(ts).strip():
            candidates.append((str(ts), src))
    if not candidates:
        return
    candidates.sort(key=lambda x: x[0])
    latest_ts, latest_src = candidates[-1]
    if latest_src == 'supervisor':
        f_status = d.get('supervisor_approval_status')
        f_comments = d.get('supervisor_comments')
        f_by = d.get('supervisor_modified_by')
    elif latest_src == 'underwriter':
        f_status = d.get('underwriter_status')
        f_comments = d.get('underwriter_comments')
        f_by = d.get('underwriter_modified_by')
    elif latest_src == 'policy':
        f_status = d.get('policy_outcome')
        f_comments = d.get('policy_outcome_comment')
        f_by = d.get('policy_outcome_modified_by')
    else:
        f_status = d.get('close_status')
        # Use close_comments for application_comments when application is latest
        f_comments = d.get('close_comments')
        f_by = d.get('close_status_modified_by')
    # Debugger statement to log the change
    current_app.logger.info(f"""\n
    ================== STATUS CHANGE (id: {unique_id}) ==================
    Source of Change: '{latest_src}'
    Timestamp: {latest_ts}
    ----------------------------------------------------------
    New Application Status: '{f_status}'
    New Application Comments: '{f_comments}'
    New Application Modified By: '{f_by}'
    ===============================================================\n    """)

    cur.execute(
        """
        UPDATE submissions
        SET application_status = ?, application_comments = ?, application_modified_at = ?, application_modified_by = ?
        WHERE unique_id = ?
        """,
        (f_status, f_comments, latest_ts, f_by, unique_id)
    )
    # Append audit log (no overwrite) to Final_Status.db
    try:
        insert_application_status_log_entry(unique_id, f_status, f_comments, latest_ts, f_by, source=latest_src)
    except Exception:
        pass

# --- Fetch submission by unique_id ---
@approvals_bp.route("/submission/<unique_id>", methods=["GET"])
def get_submission(unique_id):
    if not unique_id or not unique_id.strip():
        return jsonify({"error": "Invalid unique_id"}), 400
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM submissions WHERE unique_id = ?", (unique_id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({"error": "Not found"}), 404

        data = dict(row)

        # Parse and merge form_summary data
        if data.get("form_summary"):
            try:
                form_data = json.loads(data["form_summary"])
                if isinstance(form_data, dict):
                    # Merge form_summary data into the main data object
                    for key, value in form_data.items():
                        if key not in data or data[key] is None:
                            data[key] = value
                    current_app.logger.info(f"Successfully parsed form_summary for {unique_id}")
                else:
                    current_app.logger.warning(f"form_summary is not a dict for {unique_id}")
            except json.JSONDecodeError as e:
                current_app.logger.error(f"Invalid JSON in form_summary for {unique_id}: {e}")
                # Don't fail the request, just log the error
                pass
        else:
            current_app.logger.warning(f"Empty or null form_summary for {unique_id}")

        # Ensure defaults exist
        if data.get("underwriter_status") in (None, ""):
            data["underwriter_status"] = ""

        # Ensure client_review (checkbox state) default to 0 (unchecked)
        if data.get("client_review") is None:
            data["client_review"] = 0

        # Ensure basic fields exist
        if not data.get("unique_id"):
            data["unique_id"] = unique_id

        return jsonify(data)
        
    except Exception as e:
        current_app.logger.error(f"Database error retrieving {unique_id}: {e}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn:
            conn.close()


# --- Update status with comments ---
@approvals_bp.route("/update_status", methods=["POST"])
def update_status():
    payload = request.get_json() or {}
    unique_id = payload.get("unique_id")
    status = payload.get("status")
    comment = payload.get("comment")
    actor = payload.get("actor")  # expected: "client" or "underwriter"

    # Validation: allow client_review-only updates for actor=client
    if not unique_id or not actor:
        return jsonify({"error": "Missing data"}), 400
    if actor != "client" and not status:
        return jsonify({"error": "Missing status for non-client actor"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        if actor == "client":
            # Determine if this is a review-only update or a status change to Client_reviewed/Client_closed
            incoming_status = (status or '').strip().lower() if status else ''
            ist = pytz.timezone('Asia/Kolkata')
            modified_at = datetime.now(ist).isoformat()
            modified_by = request.headers.get('X-User-Id') or 'Unknown'

            # If client_review flag provided, persist it (independent of status)
            client_review = payload.get("client_review")
            client_agreed_plans = payload.get("client_agreed_plans")  # New field for selected plans
            
            if client_review is not None:
                try:
                    client_review_val = 1 if str(client_review).strip().lower() in ("1","true","yes","checked","on") else 0
                except Exception:
                    client_review_val = 0
                
                # Prepare the update query - include Client_Agreed_Plans if provided
                if client_agreed_plans is not None:
                    # Convert list to JSON string if it's a list
                    if isinstance(client_agreed_plans, list):
                        client_agreed_plans_str = json.dumps(client_agreed_plans)
                    else:
                        client_agreed_plans_str = client_agreed_plans
                    
                    # Also include client_status if provided
                    client_status = payload.get("client_status")
                    cursor.execute(
                        """
                        UPDATE submissions
                        SET client_review = ?, client_comments = ?, Client_Agreed_Plans = ?, client_status = ?,
                            close_status = ?, close_status_modified_at = ?, close_status_modified_by = ?
                        WHERE unique_id = ?
                        """,
                        (client_review_val, comment, client_agreed_plans_str, client_status, 
                         client_status, modified_at, modified_by, unique_id),
                    )
                else:
                    # This branch handles the case where client_agreed_plans is not provided.
                    # We still need to update the timestamps to ensure the roll-up logic works.
                    client_status = payload.get("client_status")
                    cursor.execute(
                        """
                        UPDATE submissions
                        SET client_review = ?, client_comments = ?, client_status = ?,
                            close_status = ?, close_status_modified_at = ?, close_status_modified_by = ?
                        WHERE unique_id = ?
                        """,
                        (client_review_val, comment, client_status, 
                         client_status, modified_at, modified_by, unique_id),
                    )

           
        elif actor == "underwriter":
            # Allow underwriter only if client has reviewed (client_review = 1)
            cursor.execute("SELECT client_review FROM submissions WHERE unique_id = ?", (unique_id,))
            row = cursor.fetchone()
            client_review_flag = 0
            try:
                client_review_flag = int(row["client_review"]) if row and "client_review" in row.keys() and row["client_review"] is not None else 0
            except Exception:
                client_review_flag = 0
            if client_review_flag != 1:
                conn.close()
                return jsonify({"error": "Underwriter cannot act before Client review"}), 400

            # Map requested status to strict values as per requirement
            incoming = (status or '').strip().lower()
            if incoming in ('approved','uw_approved'):
                # Renamed canonical status from UW_approved -> With_UW
                db_status = 'With_UW'
            elif incoming in ('rejected','uw_rejected'):
                db_status = 'UW_Rejected'
            elif incoming in ('with_uw', 'with uw', 'withuw'):
                db_status = 'With_UW'
            else:
                # fallback to raw status if another value is posted (e.g., changes_requested)
                db_status = status

            # Audit columns
            ist = pytz.timezone('Asia/Kolkata')
            modified_at = datetime.now(ist).isoformat()
            modified_by = request.headers.get('X-User-Id') or 'Unknown'

            cursor.execute(
                """
                UPDATE submissions
                SET underwriter_status = ?,
                    underwriter_comments = ?,
                    underwriter_modified_at = ?,
                    underwriter_modified_by = ?
                WHERE unique_id = ?
                """,
                (db_status, comment, modified_at, modified_by, unique_id),
            )

        else:
            conn.close()
            return jsonify({"error": "Invalid actor"}), 400

        # Recompute final_* rollup if a status-changing actor updated
        if actor in ('underwriter', 'client'):
            try:
                conn.commit() # Commit the first update
                _recompute_final_for(conn, unique_id)
                conn.commit() # Commit the second update
            except Exception as e:
                current_app.logger.error(f"Error during recompute for {unique_id}: {e}")
                pass
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": "Database error", "details": str(e)}), 500

    conn.close()
    return jsonify({"message": f"{actor.capitalize()} status updated successfully"})


# --- Get member names for a submission ---
@approvals_bp.route("/member_names/<unique_id>", methods=["GET"])
def get_member_names(unique_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT form_summary, policy_details, member_name FROM submissions WHERE unique_id = ?", (unique_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return jsonify([])

        names = []

        def push(val):
            if val is None:
                return
            s = str(val).strip()
            if not s:
                return
            # allow comma-separated
            parts = [p.strip() for p in s.split(',') if p and p.strip()]
            if not parts:
                return
            names.extend(parts)

        # include saved single member_name field if present
        try:
            push(row[2])
        except Exception:
            pass

        # parse policy_details rows if present
        try:
            pd = row[1]
            if isinstance(pd, (bytes, bytearray)):
                pd = pd.decode('utf-8', errors='ignore')
            if isinstance(pd, str) and pd.strip():
                import json
                try:
                    pd = json.loads(pd)
                except Exception:
                    pd = None
            if isinstance(pd, dict):
                rows = pd.get('rows')
                if isinstance(rows, list):
                    for r in rows:
                        try:
                            push(r.get('member_name'))
                        except Exception:
                            pass
        except Exception:
            pass

        # parse form_summary looking for any name-like fields
        try:
            fs = row[0]
            if isinstance(fs, (bytes, bytearray)):
                fs = fs.decode('utf-8', errors='ignore')
            obj = None
            if isinstance(fs, str) and fs.strip():
                import json
                try:
                    obj = json.loads(fs)
                except Exception:
                    obj = None
            elif isinstance(fs, dict):
                obj = fs
            if isinstance(obj, dict):
                seen = set()
                def collect(o):
                    if id(o) in seen:
                        return
                    seen.add(id(o))
                    if isinstance(o, dict):
                        for k, v in o.items():
                            lk = str(k).lower()
                            # direct string under any key containing 'name' or 'member'
                            if isinstance(v, str) and v.strip() and ('name' in lk or 'member' in lk):
                                push(v)
                            # arrays possibly containing strings or objects
                            if isinstance(v, list):
                                for it in v:
                                    if isinstance(it, str) and it.strip():
                                        push(it)
                                    else:
                                        collect(it)
                            # nested objects
                            if isinstance(v, dict):
                                # common fields
                                maybe = v.get('name') or v.get('member_name') or v.get('full_name') or v.get('applicant_name') or v.get('proposer_name') or v.get('primary_contact_name')
                                if maybe:
                                    push(maybe)
                                collect(v)
                    elif isinstance(o, list):
                        for it in o:
                            collect(it)
                collect(obj)
        except Exception:
            pass

        # de-duplicate preserving order
        out = []
        seen = set()
        for n in names:
            if n and n not in seen:
                seen.add(n)
                out.append(n)
        return jsonify(out)
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({"error": "Failed to compute member names", "details": str(e)}), 500


# --- Agent sets policy outcome (after UW_approved) ---
@approvals_bp.route("/policy_outcome", methods=["POST"])
def set_policy_outcome():
    payload = request.get_json() or {}
    unique_id = payload.get("unique_id")
    outcome = (payload.get("outcome") or '').strip()  # Expect 'Policy Created' or 'Policy Denied'
    comment = payload.get("comment")
    if not unique_id or not outcome:
        return jsonify({"error": "Missing data"}), 400

    # Normalize values to underscore format
    allowed = {"policy created", "policy denied"}
    norm = (outcome or '').lower()
    if norm not in allowed:
        return jsonify({"error": "Invalid outcome"}), 400

    # If denied, require a comment
    if norm == "policy denied" and not (comment and str(comment).strip()):
        return jsonify({"error": "Comment required when Policy Denied"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    ist = pytz.timezone('Asia/Kolkata')
    modified_at = datetime.now(ist).isoformat()
    modified_by = request.headers.get('X-User-Id') or 'Unknown'
    try:
        # Map to canonical underscore values for storage
        stored_outcome = 'Policy_Created' if norm == 'policy created' else 'Policy_Denied'

        cur.execute(
            """
            UPDATE submissions
            SET policy_outcome = ?,
                policy_outcome_comment = ?,
                policy_outcome_modified_at = ?,
                policy_outcome_modified_by = ?
            WHERE unique_id = ?
            """,
            (stored_outcome, comment, modified_at, modified_by, unique_id)
        )
        # Recompute final_* after policy outcome change
        try:
            conn.commit() # Commit the first update
            _recompute_final_for(conn, unique_id)
            conn.commit() # Commit the second update
        except Exception as e:
            current_app.logger.error(f"Error during recompute for {unique_id}: {e}")
            pass
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": "Database error", "details": str(e)}), 500
    conn.close()
    return jsonify({"message": "Policy outcome saved"})


# --- Agent saves policy details when Policy Created ---
@approvals_bp.route("/policy_details", methods=["POST"])
def set_policy_details():
    payload = request.get_json() or {}
    unique_id = payload.get("unique_id")
    policy_number = payload.get("policy_number")
    policy_name = payload.get("policy_name")
    member_number = payload.get("member_number")
    member_name = payload.get("member_name")
    policy_start_date = payload.get("policy_start_date")  # ISO date string expected YYYY-MM-DD
    policy_period_months = payload.get("policy_period_months")
    policy_details = payload.get("policy_details")
    close_comments = (payload.get("close_comments") or "").strip()

    if not unique_id:
        return jsonify({"error": "Missing unique_id"}), 400
    if not policy_number or not member_number or not member_name or not policy_start_date:
        return jsonify({"error": "Missing required policy fields"}), 400

    # Compute end date server-side as safety net
    try:
        from datetime import date
        y, m, d = map(int, str(policy_start_date).split('-'))
        start = date(y, m, d)
        months = int(policy_period_months or 12)
        end_year = y + (m - 1 + months) // 12
        end_month = (m - 1 + months) % 12 + 1
        # Keep same day if possible; if invalid (e.g., Feb 30), fallback to last day of month
        import calendar
        last_day = calendar.monthrange(end_year, end_month)[1]
        end_day = min(d, last_day)
        end_date = date(end_year, end_month, end_day).isoformat()
    except Exception:
        end_date = None

    conn = get_db_connection()
    cur = conn.cursor()
    ist = pytz.timezone('Asia/Kolkata')
    modified_at = datetime.now(ist).isoformat()
    modified_by = request.headers.get('X-User-Id') or 'Unknown'
    try:
        cur.execute(
            """
            UPDATE submissions
            SET policy_number = ?,
                policy_name = ?,
                member_number = ?,
                member_name = ?,
                policy_start_date = ?,
                policy_period_months = ?,
                policy_end_date = ?,
                policy_details = ?,
                close_status = ?,
                close_comments = ?,
                close_status_modified_at = ?,
                close_status_modified_by = ?
            WHERE unique_id = ?
            """,
            (
                policy_number,
                policy_name,
                member_number,
                member_name,
                policy_start_date,
                policy_period_months,
                end_date,
                policy_details,
                'Policy_Created',
                close_comments,
                modified_at,
                modified_by,
                unique_id,
            )
        )
        # Recompute final_* after application status change
        try:
            conn.commit() # Commit the first update
            _recompute_final_for(conn, unique_id)
            conn.commit() # Commit the second update
        except Exception as e:
            current_app.logger.error(f"Error during recompute for {unique_id}: {e}")
            pass
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": "Database error", "details": str(e)}), 500
    conn.close()
    return jsonify({"message": "Policy details saved", "policy_end_date": end_date})

# --- Read Final Status change history ---
@approvals_bp.route("/application_status_history/<unique_id>", methods=["GET"])
def get_application_status_history(unique_id):
    try:
        conn = get_application_status_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, unique_id, application_status, application_comments, application_modified_at, application_modified_by, source, created_at
            FROM application_status_log
            WHERE unique_id = ?
            ORDER BY id ASC
            """,
            (unique_id,)
        )
        rows = cur.fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({"error": "Failed to read history", "details": str(e)}), 500
