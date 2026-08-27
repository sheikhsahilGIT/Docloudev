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
from services import docker_manager
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
    """Real health check — actually pings Mongo and Docker rather than
    just confirming the Flask process itself is alive."""
    db_status = "healthy"
    try:
        projects_collection.database.client.admin.command("ping")
    except Exception as e:
        db_status = "unhealthy"
        app.logger.warning(f"Health check: database unreachable: {e}")

    docker_status = "healthy"
    try:
        docker_manager._client.ping()
    except Exception as e:
        docker_status = "unhealthy"
        app.logger.warning(f"Health check: docker unreachable: {e}")

    overall_healthy = db_status == "healthy" and docker_status == "healthy"

    return jsonify({
        "status": "healthy" if overall_healthy else "degraded",
        "database": db_status,
        "docker": docker_status,
    }), 200 if overall_healthy else 503


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

    try:
        project = projects_collection.find_one({
            "_id": ObjectId(project_id),
            "userId": payload["userId"],
        })
    except Exception:
        emit("terminal_error", {"message": "Invalid project"})
        return

    if not project or not project.get("containerId") or project.get("status") != "running":
        emit("terminal_error", {"message": "Container is not running — start it first."})
        return

    session_id = request.sid
    join_room(session_id)
    try:
        terminal_manager.start_terminal_session(session_id, project["containerId"], socketio, cols, rows)
        emit("terminal_ready", {})
    except Exception as e:
        app.logger.error(f"Terminal session failed to start: {e}")
        emit("terminal_error", {"message": "Unable to start the terminal. Please try again."})


@socketio.on("terminal_input")
def handle_terminal_input(data):
    terminal_manager.write_to_session(request.sid, data.get("input", ""))


@socketio.on("terminal_resize")
def handle_terminal_resize(data):
    terminal_manager.resize_session(request.sid, data.get("cols", 80), data.get("rows", 24))


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=True)