# Insurance Plan Recommendation Engine

This project is a Flask-based web application designed to help insurance agents find the best health insurance plans for their clients. It takes detailed client information, including family structure and health history, and uses a data-driven analysis pipeline to generate personalized plan recommendations.

## Key Features

- **Multi-Page Data Entry Form**: A comprehensive web form for capturing all necessary client details.
- **AI-Powered Data Structuring**: Uses the Gemini AI model to parse raw user input into a standardized, machine-readable JSON format.
- **Dynamic Plan Scoring**: A sophisticated scoring engine that ranks insurance plans based on how well they match a client's specific health needs and preferences.
- **Intelligent Plan Bundling**: Automatically groups ranked plans into user-friendly options, such as "Best Family Floater" and "Best Combination of Individual Plans."
- **Role-Based Dashboards**: Provides different views for agents, supervisors, and administrators.

## Project Structure

The project is structured as a standard Flask application package for scalability and maintainability.

```
/Insurance_Req_Form/
├── instance/                 # Contains instance-specific files like databases
│   └── *.db
├── insurance_app/            # The main Flask application package
│   ├── __init__.py         # Application factory
│   ├── analysis/           # Core plan analysis and scoring logic
│   ├── blueprints/         # Application routes and views
│   ├── static/             # CSS, JavaScript, and image files
│   ├── templates/          # HTML templates
│   ├── config.py           # Application configuration
│   ├── database.py         # Database connection and initialization
│   └── prompt.txt          # System prompt for the AI model
├── .env                      # Environment variables (e.g., API keys)
├── Procfile                  # Command for production deployment (e.g., on Heroku)
├── requirements.txt          # Python dependencies
├── run.py                    # Script to start the application
└── delme/                    # Contains non-essential files (tests, dev scripts)
```

## Setup and Installation

### Prerequisites
- Python 3.9+
- Conda for environment management

### Steps

1.  **Clone the Repository**
    ```bash
    git clone <your-repository-url>
    cd Insurance_Req_Form
    ```

2.  **Create and Activate Conda Environment**
    ```bash
    conda create --name insurance_agent_env python=3.10
    conda activate insurance_agent_env
    ```

3.  **Install Dependencies**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Set Up Environment Variables**
    - Create a file named `.env` in the project root.
    - Add your Gemini API key to the file:
      ```
      GEMINI_API_KEY="your_api_key_here"
      ```

## Running the Application

To run the application in development mode, execute the `run.py` script from the project root:

```bash
python run.py
```

The application will be available at `http://127.0.0.1:5000`.

## Deployment

This application has been configured for deployment on platforms that support Python/WSGI, such as Heroku or Render.

-   **WSGI Server**: The project uses `gunicorn` as its production web server, which is included in `requirements.txt`.
-   **Procfile**: The `Procfile` is configured to tell the deployment service how to start the application using gunicorn:
    ```
    web: gunicorn run:app
    ```
