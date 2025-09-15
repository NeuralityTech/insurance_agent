import os
import sqlite3
import sys



# Function to fetch plan names based on derived summary

from flask import current_app

def fetch_plans(summary: dict) -> dict:
    conn = sqlite3.connect(current_app.config['DERIVED_DB_PATH'])
    cursor = conn.cursor()
    # Verify 'plans' table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='features';")
    if not cursor.fetchone():
        print("Error: 'features' table not found in derived.db")
        tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]
        print("Available tables:", tables)
        sys.exit(1)

    plans = {}

    def query_plans(feature, value, base_plans):
        # Create a placeholder string for the IN clause
        placeholders = ','.join('?' for _ in base_plans)
        params = []

        # Combined range query for adult and child ages
        if feature == 'age':
            sql = f'''
                SELECT Plan_Name
                  FROM features
                 WHERE adult_min_entry_age <= ?
                   AND adult_max_entry_age >= ?
                   AND Plan_Name IN ({placeholders})
            '''
            params.extend([value, value])
        elif feature == 'child_age':
            age_in_days = int(float(value) * 365)
            sql = f'''
                SELECT Plan_Name
                  FROM features
                 WHERE child_min_entry_age <= ?
                   AND child_max_entry_age >= ?
                   AND Plan_Name IN ({placeholders})
            '''
            params.extend([age_in_days, value])
        elif feature == 'gender':
            if value == 'Female':
                # For females, include 'Female' specific and 'All' gender plans
                sql = f'SELECT Plan_Name FROM features WHERE "gender" IN (?, ?) AND Plan_Name IN ({placeholders})'
                params.extend(['Female', 'All'])
            else: # Handles 'Male', 'All', or any other value
                # For males or others, only include 'All' gender plans
                sql = f'SELECT Plan_Name FROM features WHERE "gender" = ? AND Plan_Name IN ({placeholders})'
                params.append('All')
        else:
            # Default equality filter for other features
            sql = f'SELECT Plan_Name FROM features WHERE "{feature}" = ? AND Plan_Name IN ({placeholders})'
            params.append(value)
        
        params.extend(base_plans)
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        return [r[0] for r in rows]

    # Build plans by scoring feature matches
    for section, features in summary.items():
        if not isinstance(features, dict):
            continue

        member_name = features.get('name', section)
        status = features.get('status', 'active')  # Default to 'active'
        disease_code = features.get('disease_code')

        # Step 1: Pre-filter plans based on status and disease code
        if disease_code and disease_code != 'GENERAL':
            # Strict filter: Only get plans for the specific disease, using LIKE for robustness
            cursor.execute('SELECT Plan_Name FROM features WHERE "status" LIKE ? AND "Disease_Code" LIKE ?', (status, disease_code))
        else:
            # Broad filter: Get all general and active plans
            cursor.execute('SELECT Plan_Name FROM features WHERE "status" = ?', (status,))
        
        active_plans = [row[0] for row in cursor.fetchall()]

        if not active_plans:
            plans[section] = {'name': member_name, 'plans': []}
            continue

        plan_scores = {}
        features_to_query = {k: v for k, v in features.items() if k not in ['name', 'status']}

        # For each feature, get matching plans from the active set and increment their score
        for k, v in features_to_query.items():
            matching_plans = query_plans(k, v, active_plans)
            for plan in matching_plans:
                plan_scores[plan] = plan_scores.get(plan, 0) + 1
        
        # Sort plans by score (number of matched features) in descending order
        sorted_plans = sorted(plan_scores.items(), key=lambda item: item[1], reverse=True)
        
        # Get the names of the top 5 plans
        top_5_plans = [plan[0] for plan in sorted_plans[:5]]

        plans[section] = {
            'name': member_name,
            'plans': top_5_plans
        }
    conn.close()

    return plans



