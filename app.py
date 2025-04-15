from flask import Flask, request, render_template, jsonify
from datetime import datetime, timezone
from bluesky_analyzer import run_analysis
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

USERNAME = os.getenv("USERNAME")
APP_PASSWORD = os.getenv("APP_PASSWORD")

@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")


from datetime import datetime, timezone, timedelta

@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        query = request.form.get("query", "").strip()
        start_date_str = request.form.get("start_date", "").strip()
        end_date_str = request.form.get("end_date", "").strip()
        start_hour_str = request.form.get("start_hour", "").strip()
        end_hour_str = request.form.get("end_hour", "").strip()

        if not query:
            return jsonify({"success": False, "error": "Search term is required."}), 400

        today = datetime.now(timezone.utc).date()
        start_date = (
            datetime.fromisoformat(start_date_str).replace(tzinfo=timezone.utc)
            if start_date_str else datetime.combine(today - timedelta(days=1000), datetime.min.time(), tzinfo=timezone.utc)
        )
        end_date = (
            datetime.fromisoformat(end_date_str).replace(tzinfo=timezone.utc)
            if end_date_str else datetime.combine(today, datetime.max.time(), tzinfo=timezone.utc)
        )

        start_hour = int(start_hour_str) if start_hour_str.isdigit() else 0
        end_hour = int(end_hour_str) if end_hour_str.isdigit() else 24

        if start_date > end_date:
            return jsonify({"success": False, "error": "Start date must be before end date."}), 400
        if start_hour >= end_hour:
            return jsonify({"success": False, "error": "Start hour must be before end hour."}), 400

        count = run_analysis(
            username=USERNAME,
            app_password=APP_PASSWORD,
            query=query,
            start_date=start_date,
            end_date=end_date,
            start_hour=start_hour,
            end_hour=end_hour,
            limit=100
        )

        return jsonify({"success": True, "message": f"Analyzed {count} posts."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    
SAVE_DIR = "saved_results"
os.makedirs(SAVE_DIR, exist_ok=True)

@app.route("/save_result", methods=["POST"])
def save_result():
    try:
        data = request.get_json()
        query = data.get("query", "search")
        results = data.get("results", [])

        if not results:
            return jsonify({"success": False, "error": "No results to save."}), 400

        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M")
        filename = f"{timestamp}-{query.replace(' ', '_')}.json"
        filepath = os.path.join(SAVE_DIR, filename)

        with open(filepath, "w") as f:
            json.dump(results, f, indent=2)

        return jsonify({"success": True, "filename": filename})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/saved_list")
def saved_list():
    files = sorted(os.listdir(SAVE_DIR), reverse=True)
    return jsonify(files)

@app.route("/saved/<filename>")
def load_saved(filename):
    filepath = os.path.join(SAVE_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath) as f:
            return jsonify(json.load(f))
    return jsonify({"error": "File not found"}), 404

if __name__ == "__main__":
    app.run(debug=True)
