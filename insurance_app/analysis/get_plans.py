import os
import sqlite3
import sys

# Function to fetch plan names based on derived summary

from flask import current_app, g
from insurance_app.database import get_derived_db_connection
from .plan_utils import is_plan_valid_for_family

import json
import pandas as pd

def _safe_int(val, default=0):
    try:
        if val is None or val == '':
            return int(default)
        # If it's a string like '12.0', cast via float first then int
        if isinstance(val, str) and ('.' in val or val.strip().isdigit() is False):
            return int(float(val))
        return int(val)
    except Exception:
        return int(default)


def _safe_float(val, default=0.0):
    try:
        if val is None or val == '':
            return float(default)
        return float(val)
    except Exception:
        return float(default)


def fetch_plans(summary: dict, client_data: dict) -> dict:
    # Load configuration from the JSON file
    config_path = os.path.join(current_app.root_path, 'proposed_plans_config.json')
    with open(config_path, 'r') as f:
        config = json.load(f)

    # --- Get family structure directly from the AI response (robust casting) ---
    num_adults = _safe_int(summary.get('num_adults', 0), 0)
    num_children = _safe_int(summary.get('num_children', 0), 0)

    db = get_derived_db_connection()
    cursor = db.cursor()
    # Verify 'features' table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='features';")
    if not cursor.fetchone():
        print("Error: 'features' table not found in derived.db")
        sys.exit(1) # Simplified error handling

    plans = {}

    def query_plans(feature_config, value, base_plans):
        placeholders = ','.join('?' for _ in base_plans)
        params = []
        
        # Dynamically build query based on config
        feature_name = feature_config['feature']
        query_type = feature_config.get('type', 'equality')

        if query_type == 'range':
            min_col, max_col = feature_config['min_col'], feature_config['max_col']
            # Special handling for child age in days
            query_value = _safe_int(_safe_float(value, 0.0) * 365, 0) if feature_name == 'child_age' else value
            sql = f'SELECT Plan_Name FROM features WHERE "{min_col}" <= ? AND "{max_col}" >= ? AND Plan_Name IN ({placeholders})'
            params.extend([query_value, value])
        
        elif feature_name == 'gender': # Special handling for gender
            if value == 'Female':
                sql = f'SELECT Plan_Name FROM features WHERE "gender" IN (?, ?) AND Plan_Name IN ({placeholders})'
                params.extend(['Female', 'All'])
            else:
                sql = f'SELECT Plan_Name FROM features WHERE "gender" = ? AND Plan_Name IN ({placeholders})'
                params.append('All')
        else: # Default equality
            sql = f'SELECT Plan_Name FROM features WHERE "{feature_name}" = ? AND Plan_Name IN ({placeholders})'
            params.append(value)

        params.extend(base_plans)
        cursor.execute(sql, params)
        return [r[0] for r in cursor.fetchall()]

    # Build plans by scoring feature matches
    for section, features in summary.items():
        if not isinstance(features, dict):
            continue

        member_name = features.get('name', section)
        
        # --- Step 1: Hard Filtering (Simplified and Corrected) ---
        age = _safe_int(features.get('age'), 0)
        status = features.get('status', 'active')
        member_disease_code = features.get('disease_code', 'GENERAL').upper()

        sql_params = []
        
        # Base query for universal filters
        base_sql = """SELECT Plan_Name FROM features WHERE "status" = ? AND "Adult_Min_Entry_Age" <= ? AND "Adult_Max_Entry_Age" >= ?"""
        sql_params.extend([status, age, age])

        # Conditionally add the disease filter
        if member_disease_code == 'GENERAL':
            base_sql += ' AND ("Disease_Code" = ? OR "Disease_Code" IS NULL)'
            sql_params.append('GENERAL')
        else:
            codes = {c.strip() for c in member_disease_code.split(',') if c.strip() and c.strip() != 'MULTI'}
            if codes:
                placeholders = ', '.join('?' for _ in codes)
                base_sql += f' AND "Disease_Code" IN ({placeholders})'
                sql_params.extend(list(codes))

        current_app.logger.info(f"Executing query for {member_name}: {base_sql}")
        current_app.logger.info(f"With parameters: {sql_params}")
        cursor.execute(base_sql, sql_params)
        active_plans = [row[0] for row in cursor.fetchall()]

        if not active_plans:
            plans[section] = {'name': member_name, 'plans': []}
            continue

        # --- Step 2: Value-based Scoring based on config ---
        plan_scores = {}
        features_to_query = {k: v for k, v in features.items() if k not in ['name', 'status', 'disease_code']}
        
        # Add disease_code back for scoring
        if features.get('disease_code') and features.get('disease_code') != 'GENERAL':
            features_to_query['disease_code'] = features['disease_code']

        # Get scoring weights from config
        weights = config['scoring']['weights']
        default_weight = weights.get('default', 1)

        for k, v in features_to_query.items():
            score_increment = weights.get(k, default_weight)
            
            # Find the matching filter config for the feature 'k'
            filter_config = next((item for item in config['value_filters'] if item['feature'] == k), None)
            
            # For disease_code, we just check for its presence for scoring
            if k == 'disease_code':
                # The hard filter already selected plans with this disease, so all active_plans get the score
                matching_plans = active_plans
            elif filter_config:
                matching_plans = query_plans(filter_config, v, active_plans)
            else:
                continue # Skip if no filter config found

            for plan in matching_plans:
                plan_scores[plan] = plan_scores.get(plan, 0) + score_increment
        
        sorted_plans = sorted(plan_scores.items(), key=lambda item: item[1], reverse=True)

        # --- New Logic: Conditionally validate GENERAL plans against family structure ---
        validated_plans = []
        if member_disease_code == 'GENERAL':
            # For general plans, we must check if they fit the family structure
            all_plan_details = pd.read_sql_query(f"SELECT Plan_Name, Policy_Code FROM features WHERE Plan_Name IN ({','.join('?' for _ in sorted_plans)})", db, params=[p[0] for p in sorted_plans])
            plan_code_map = dict(zip(all_plan_details['Plan_Name'], all_plan_details['Policy_Code']))

            for plan_name, score in sorted_plans:
                policy_code = plan_code_map.get(plan_name)
                is_valid = is_plan_valid_for_family(policy_code, num_adults, num_children, current_app.logger)
                if is_valid:
                    validated_plans.append((plan_name, score))
        else:
            # For disease-specific plans, we assume they are individual and don't filter by family structure here
            validated_plans = sorted_plans

        top_n = config['scoring'].get('top_n', 5) # Default to 5 if not in config
        top_5_plans = [plan[0] for plan in validated_plans[:top_n]]

        plans[section] = {
            'name': member_name,
            'plans': top_5_plans
        }
        
    db.close()
    return plans



