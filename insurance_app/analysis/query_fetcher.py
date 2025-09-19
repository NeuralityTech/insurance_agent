# To run this code you need to install the following dependencies:
# pip install google-genai

import base64
import os
import sqlite3
import sys
import json

from .get_plans import fetch_plans
from dotenv import load_dotenv
from google import genai
from google.genai import types
from flask import current_app

load_dotenv()

def generate(text):
    client = genai.Client(
        api_key=os.environ.get("GEMINI_API_KEY"),
    )

    prompt_path = os.path.join(current_app.root_path, 'prompt.txt')
    with open(prompt_path, 'r') as f:
        system_prompt = f.read()

    model = "gemini-2.5-flash-lite"
    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=text),
            ],
        ),
    ]
    generate_content_config = types.GenerateContentConfig(
        temperature=0.1,
        thinking_config=types.ThinkingConfig(
            thinking_budget=1000,
        ),
        system_instruction=[
            types.Part.from_text(text=system_prompt),
        ],
    )

    result = ""
    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        if chunk.text:
            result += chunk.text
    return result


def clean_and_parse(raw_output):
    """Clean fences and parse JSON from raw Gemini output"""
    text = raw_output.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        current_app.logger.error("Raw generated output: %r", raw_output)
        current_app.logger.error("Failed to parse generated output as JSON: %s", e)
        raise ValueError("Failed to parse generated output as JSON.") from e

