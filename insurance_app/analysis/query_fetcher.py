import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.api_core import exceptions as google_exceptions
from flask import current_app
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

load_dotenv()

# --- Performance Improvements ---
# Initialize the client once to be reused across all requests.
GEMINI_CLIENT = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# Load the system prompt once using a lazy-loading approach.
SYSTEM_PROMPT = None

# Add a retry decorator to handle transient API errors
@retry(
    retry=retry_if_exception_type((
        google_exceptions.ServiceUnavailable, # 503
        google_exceptions.DeadlineExceeded,   # 504
        google_exceptions.ResourceExhausted,  # 429
    )),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    before_sleep=lambda retry_state: current_app.logger.warning(
        f"Retrying Gemini API call (attempt {retry_state.attempt_number}) after error: {retry_state.outcome.exception()}"
    )
)
def generate(text, system_prompt_text=None):
    """Generates content using the Gemini API with efficient, cached resources."""
    global SYSTEM_PROMPT

    # Use the provided system prompt, or lazy-load the default one.
    if system_prompt_text is None:
        if SYSTEM_PROMPT is None:
            try:
                prompt_path = os.path.join(current_app.root_path, 'prompt.txt')
                with open(prompt_path, 'r') as f:
                    SYSTEM_PROMPT = f.read()
            except Exception as e:
                current_app.logger.error(f"Failed to load default system prompt: {e}")
                raise
        prompt_to_use = SYSTEM_PROMPT
    else:
        prompt_to_use = system_prompt_text

    model = "gemini-2.5-flash-lite"
    contents = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=text)],
        ),
    ]
    generate_content_config = types.GenerateContentConfig(
        temperature=0.1,
        thinking_config=types.ThinkingConfig(
            thinking_budget=3000,
        ),
        system_instruction=[types.Part.from_text(text=prompt_to_use)],
    )

    result = ""
    for chunk in GEMINI_CLIENT.models.generate_content_stream(
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

