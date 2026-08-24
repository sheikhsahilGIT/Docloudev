import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from dotenv import load_dotenv

from routes.auth import auth_bp
from routes.projects import projects_bp
from routes.containers import containers_bp
from routes.files import files_bp
from services import terminal_manager
from utils.auth_utils import decode_token
from models.db import projects_collection
from bson import ObjectId

load_dotenv()

app = Flask(__name__)
CORS(app)

socketio = SocketIO(app, cors_allowed_origins="*")

app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(projects_bp, url_prefix="/api/projects")
app.register_blueprint(containers_bp, url_prefix="/api/projects")
app.register_blueprint(files_bp, url_prefix="/api/projects")


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "message": "CloudDev backend is running"})


@socketio.on("connect")
def handle_connect():
    print("Client connected")


@socketio.on("disconnect")
def handle_disconnect():
    terminal_manager.close_session(request.sid)
    print("Client disconnected")


# ============================================================
# Live terminal — bridges Xterm.js in the browser to a real shell
# running inside the project's EXISTING Phase 3 container.
#
# The browser sends only a projectId. This handler looks up that
# project's containerId itself (after checking ownership) — a user
# can never pass a raw container_id and reach someone else's
# container this way.
# ============================================================

@socketio.on("terminal_start")
def handle_terminal_start(data):
    token = data.get("token")
    project_id = data.get("projectId")
    cols = data.get("cols", 80)
    rows = data.get("rows", 24)

    payload = None
    if token:
        try:
            payload = decode_token(token)
        except Exception:
            payload = None

    if not payload:
        emit("terminal_error", {"message": "Unauthorized"})
        return

    project = projects_collection.find_one({
        "_id": ObjectId(project_id),
        "userId": payload["userId"],
    })

    if not project or not project.get("containerId") or project.get("status") != "running":
        emit("terminal_error", {"message": "Container is not running — start it first."})
        return

    session_id = request.sid
    join_room(session_id)
    terminal_manager.start_terminal_session(session_id, project["containerId"], socketio, cols, rows)
    emit("terminal_ready", {})


@socketio.on("terminal_input")
def handle_terminal_input(data):
    terminal_manager.write_to_session(request.sid, data.get("input", ""))


@socketio.on("terminal_resize")
def handle_terminal_resize(data):
    terminal_manager.resize_session(request.sid, data.get("cols", 80), data.get("rows", 24))


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=True)