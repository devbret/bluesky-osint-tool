from flask import Flask, request, render_template, jsonify
from datetime import datetime, timezone, timedelta
from bluesky_analyzer import run_analysis
from bluesky_analyzer import get_post_thread
from bluesky_analyzer import unfollow_user
from bluesky_analyzer import follow_user
from bluesky_analyzer import like_post
from bluesky_analyzer import unlike_post
from bluesky_analyzer import repost_post
from bluesky_analyzer import unrepost_post
from dotenv import load_dotenv
import os
import json

load_dotenv()

app = Flask(__name__)

USERNAME = os.getenv("USERNAME")
APP_PASSWORD = os.getenv("APP_PASSWORD")

@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")

@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        query = request.form.get("query", "").strip()
        start_date_str = request.form.get("start_date", "").strip()
        end_date_str   = request.form.get("end_date",   "").strip()

        if not query:
            return jsonify({"success": False, "error": "Search term is required."}), 400

        today = datetime.now(timezone.utc).date()
        if start_date_str:
            sd = datetime.fromisoformat(start_date_str).date()
            start_date = datetime.combine(sd, datetime.min.time(), tzinfo=timezone.utc)
        else:
            start_date = datetime.combine(
                today - timedelta(days=1000),
                datetime.min.time(),
                tzinfo=timezone.utc
            )
        if end_date_str:
            ed = datetime.fromisoformat(end_date_str).date()
            end_date = datetime.combine(ed, datetime.max.time(), tzinfo=timezone.utc)
        else:
            end_date = datetime.combine(
                today,
                datetime.max.time(),
                tzinfo=timezone.utc
            )

        if start_date > end_date:
            return jsonify({"success": False, "error": "Start date must be before end date."}), 400

        count = run_analysis(
            username=USERNAME,
            app_password=APP_PASSWORD,
            query=query,
            start_date=start_date,
            end_date=end_date,
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

        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
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

@app.route("/saved_batch", methods=["POST"])
def load_saved_batch():
    data = request.get_json()
    filenames = data.get("filenames", [])
    combined = []

    for filename in filenames:
        filepath = os.path.join(SAVE_DIR, filename)
        if os.path.exists(filepath):
            with open(filepath) as f:
                combined.append(json.load(f))
        else:
            return jsonify({"error": f"File {filename} not found"}), 404

    return jsonify(combined)

@app.route("/get_thread", methods=["POST"])
def get_thread():
    try:
        post_uri = request.json.get("uri")
        if not post_uri:
            return jsonify({"success": False, "error": "Post URI is required."}), 400

        thread_data = get_post_thread(USERNAME, APP_PASSWORD, post_uri)
        return jsonify({"success": True, "thread": thread_data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/follow", methods=["POST"])
def follow():
    try:
        data = request.get_json()
        did_to_follow = data.get("did")
        if not did_to_follow:
            return jsonify({"success": False, "error": "DID is required to follow."}), 400

        result = follow_user(USERNAME, APP_PASSWORD, did_to_follow)
        return jsonify({"success": True, "message": "Followed successfully.", "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    
@app.route("/unfollow", methods=["POST"])
def unfollow():
    try:
        data = request.get_json()
        follow_uri = data.get("uri")
        if not follow_uri:
            return jsonify({"success": False, "error": "URI is required to unfollow."}), 400

        result = unfollow_user(USERNAME, APP_PASSWORD, follow_uri)
        return jsonify({"success": True, "message": "Unfollowed successfully.", "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/like", methods=["POST"])
def like():
    try:
        data = request.get_json()
        uri = data.get("uri")
        cid = data.get("cid")

        if not uri or not cid:
            return jsonify({"success": False, "error": "URI and CID are required to like a post."}), 400

        result = like_post(USERNAME, APP_PASSWORD, uri, cid)
        return jsonify({"success": True, "message": "Post liked.", "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/unlike", methods=["POST"])
def unlike():
    try:
        data = request.get_json()
        like_uri = data.get("uri")

        if not like_uri:
            return jsonify({"success": False, "error": "Like URI is required to unlike."}), 400

        result = unlike_post(USERNAME, APP_PASSWORD, like_uri)
        return jsonify({"success": True, "message": "Post unliked.", "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/repost", methods=["POST"])
def repost():
    try:
        data = request.get_json()
        uri = data.get("uri")
        cid = data.get("cid")

        if not uri or not cid:
            return jsonify({"success": False, "error": "URI and CID are required to repost."}), 400

        result = repost_post(USERNAME, APP_PASSWORD, uri, cid)
        return jsonify({"success": True, "message": "Post reposted.", "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/unrepost", methods=["POST"])
def unrepost():
    try:
        data = request.get_json()
        repost_uri = data.get("uri")

        if not repost_uri:
            return jsonify({"success": False, "error": "Repost URI is required to unrepost."}), 400

        result = unrepost_post(USERNAME, APP_PASSWORD, repost_uri)
        return jsonify({"success": True, "message": "Post unreposted.", "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)