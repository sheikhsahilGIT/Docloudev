from flask import Blueprint, request, jsonify
from bson import ObjectId
from models.db import projects_collection
from utils.auth_utils import require_auth
from services import docker_manager

containers_bp = Blueprint("containers", __name__)


def _get_owned_project(project_id, owner_id):
    try:
        return projects_collection.find_one({"_id": ObjectId(project_id), "userId": owner_id})
    except Exception:
        return None


def _log_container_error(action, e):
    print(f"\n\n=== CONTAINER {action} FAILED ===\n{e}\n=== END ===\n\n")


# User-facing messages — never expose raw Docker/Python exception text.
# The real detail always goes to the server console via _log_container_error.
_CLEAN_MESSAGES = {
    "START": "Unable to start the development environment. Please try again.",
    "STOP": "Unable to stop the container. Please try again.",
    "RESTART": "Unable to restart the container. Please try again.",
    "DESTROY": "Unable to remove the container. Please try again.",
    "LOGS": "Unable to fetch logs right now.",
    "STATS": "Resource stats are temporarily unavailable.",
}


@containers_bp.route("/<project_id>/container/start", methods=["POST"])
@require_auth
def start_container(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404

    data = request.get_json(silent=True) or {}

    try:
        if project.get("containerId"):
            # Container already exists — resources can't change on an
            # existing container. Just start it back up.
            result = docker_manager.start_container(project["containerId"])
            projects_collection.update_one(
                {"_id": ObjectId(project_id)},
                {"$set": {"status": result["status"], "startedAt": result["startedAt"]}}
            )
        else:
            cpu = data.get("cpu", 1)
            memory_mb = data.get("memoryMb", 256)
            storage_mb = data.get("storageMb", 256)

            result = docker_manager.create_and_start_container(
                project_id, request.user_id, project["language"], cpu, memory_mb, storage_mb
            )
            projects_collection.update_one(
                {"_id": ObjectId(project_id)},
                {"$set": {
                    "containerId": result["containerId"],
                    "status": result["status"],
                    "cpu": result["cpu"],
                    "memoryMb": result["memoryMb"],
                    "storageMb": result["storageMb"],
                    "startedAt": result["startedAt"],
                }}
            )
    except docker_manager.ContainerError as e:
        _log_container_error("START", e)
        projects_collection.update_one({"_id": ObjectId(project_id)}, {"$set": {"status": "error"}})
        return jsonify({"message": _CLEAN_MESSAGES["START"]}), 500

    updated = projects_collection.find_one({"_id": ObjectId(project_id)})
    return jsonify({"status": updated["status"]})


@containers_bp.route("/<project_id>/container/stop", methods=["POST"])
@require_auth
def stop_container(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404
    if not project.get("containerId"):
        return jsonify({"message": "This project has no container to stop"}), 400

    try:
        status = docker_manager.stop_container(project["containerId"])
    except docker_manager.ContainerError as e:
        _log_container_error("STOP", e)
        return jsonify({"message": _CLEAN_MESSAGES["STOP"]}), 500

    projects_collection.update_one({"_id": ObjectId(project_id)}, {"$set": {"status": status}})
    return jsonify({"status": status})


@containers_bp.route("/<project_id>/container/restart", methods=["POST"])
@require_auth
def restart_container(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404
    if not project.get("containerId"):
        return jsonify({"message": "This project has no container to restart"}), 400

    try:
        result = docker_manager.restart_container(project["containerId"])
    except docker_manager.ContainerError as e:
        _log_container_error("RESTART", e)
        return jsonify({"message": _CLEAN_MESSAGES["RESTART"]}), 500

    projects_collection.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"status": result["status"], "startedAt": result["startedAt"]}}
    )
    return jsonify({"status": result["status"]})


@containers_bp.route("/<project_id>/container", methods=["DELETE"])
@require_auth
def destroy_container(project_id):
    """Destroys the container but keeps the project (and its files on
    the host volume) — the user can Start again to get a fresh container."""
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404
    if not project.get("containerId"):
        return jsonify({"message": "This project has no container to destroy"}), 400

    try:
        docker_manager.destroy_container(project["containerId"])
    except docker_manager.ContainerError as e:
        _log_container_error("DESTROY", e)
        return jsonify({"message": _CLEAN_MESSAGES["DESTROY"]}), 500

    projects_collection.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"containerId": None, "status": "not_created", "startedAt": None}}
    )
    return jsonify({"status": "not_created"})


@containers_bp.route("/<project_id>/container/status", methods=["GET"])
@require_auth
def container_status(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404
    if not project.get("containerId"):
        return jsonify({"status": "not_created"})

    status = docker_manager.get_status(project["containerId"])
    projects_collection.update_one({"_id": ObjectId(project_id)}, {"$set": {"status": status}})
    return jsonify({"status": status})


@containers_bp.route("/<project_id>/container/logs", methods=["GET"])
@require_auth
def container_logs(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404
    if not project.get("containerId"):
        return jsonify({"message": "This project has no container"}), 400

    tail = request.args.get("tail", 200, type=int)

    try:
        logs = docker_manager.get_logs(project["containerId"], tail=tail)
    except docker_manager.ContainerError as e:
        _log_container_error("LOGS", e)
        return jsonify({"message": _CLEAN_MESSAGES["LOGS"]}), 500

    return jsonify({"logs": logs})


@containers_bp.route("/<project_id>/container/stats", methods=["GET"])
@require_auth
def container_stats(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404
    if not project.get("containerId") or project.get("status") != "running":
        return jsonify({"message": "Container is not running"}), 400

    try:
        stats = docker_manager.get_stats(project["containerId"])
    except docker_manager.ContainerError as e:
        _log_container_error("STATS", e)
        return jsonify({"message": _CLEAN_MESSAGES["STATS"]}), 500

    return jsonify(stats)