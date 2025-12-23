from flask import Blueprint, request, jsonify, current_app
import os
import json
import csv
import google.generativeai as genai
from pathlib import Path
from dotenv import load_dotenv

ai_assistant_bp = Blueprint('ai_assistant', __name__)

@ai_assistant_bp.route('/ai/get-justification', methods=['POST'])
def get_ai_justification():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing JSON data"}), 400

        plan_name = data.get('plan_name')
        prompt_content = data.get('prompt_content') # This is the dynamic part

        if not plan_name or not prompt_content:
            return jsonify({"error": "Missing plan_name or prompt_content"}), 400

        # Load environment variables from specific path
        env_path = Path(current_app.root_path).parent / ".env"
        load_dotenv(dotenv_path=env_path)
        
        # Check for multiple possible key names
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        
        if not api_key:
            return jsonify({"error": f"API Key not found in {env_path}"}), 500

        # Configure Gemini
        genai.configure(api_key=api_key)
        # Using the model ID specified by the user
        model = genai.GenerativeModel("gemini-2.5-flash-lite")

        # Define assets path relative to app root
        assets_dir = Path(current_app.root_path) / "ai_assets"
        system_prompt_file = assets_dir / "system_prompt.txt"
        policy_json_dir = assets_dir / "policy_json"

        # 1. Load System Prompt
        try:
            with open(system_prompt_file, "r") as f:
                system_prompt = f.read().strip()
        except Exception as e:
            return jsonify({"error": f"Error loading system prompt: {str(e)}"}), 500

        # 2. Locate Assets
        if not policy_json_dir.exists():
            return jsonify({"error": "'policy_json' directory not found"}), 500
            
        mapping_file = assets_dir / "plan_mapping.csv"
        if not mapping_file.exists():
             return jsonify({"error": "'plan_mapping.csv' not found in assets"}), 500

        # 3. Resolve Json File from CSV
        json_filename = None
        
        try:
            with open(mapping_file, mode='r', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                for row in reader:
                    # Match input plan name to CSV 'Plan Name'
                    if row['Plan Name'].strip().lower() == plan_name.strip().lower():
                        potential_file = row['Policy Filename']
                        if potential_file and potential_file.lower() != 'na':
                            json_filename = potential_file
                        break
        except Exception as e:
             return jsonify({"error": f"Error reading mapping CSV: {str(e)}"}), 500

        if not json_filename:
             return jsonify({"error": f"No mapped policy document found for '{plan_name}'"}), 404

        json_file_path = policy_json_dir / json_filename
        if not json_file_path.exists():
             return jsonify({"error": f"Mapped file '{json_filename}' does not exist on disk"}), 404

        # 4. Load JSON Data
        try:
            with open(json_file_path, "r") as f:
                policy_data = json.load(f)
                context = json.dumps(policy_data, indent=2)
        except Exception as e:
            return jsonify({"error": f"Error reading policy JSON: {str(e)}"}), 500

        # 4. Construct Full Prompt
        full_ai_prompt = f"""
{system_prompt}

Policy Information (JSON Context):
---
{context}
---

Patient and Plan Details:
---
{prompt_content}
---

User Request: Please generate a detailed comparison highlight and justification for choosing this plan based on the above information.
"""
        
        # 5. Get Response
        response = model.generate_content(full_ai_prompt)
        text_response = response.text.strip()
        
        return jsonify({"justification": text_response})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
