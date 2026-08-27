from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from models.db import projects_collection
from utils.auth_utils import require_auth
from services import docker_manager

projects_bp = Blueprint("projects", __name__)

ALLOWED_LANGUAGES = {"python", "java", "cpp"}


def _reconcile_status(project):
    """If the database says a container is running (or mid-transition)
    but Docker disagrees, the database was stale — sync it to reality
    rather than let the dashboard keep showing a status that's no
    longer true (e.g. someone ran `docker stop` outside the app, or
    the container crashed)."""
    container_id = project.get("containerId")
    db_status = project.get("status")

    if not container_id or db_status not in ("running", "starting", "restarting"):
        return project

    real_status = docker_manager.get_status(container_id)

    if real_status == "running":
        mapped = "running"
    elif real_status in ("exited", "not_found", "dead"):
        mapped = "stopped"
    else:
        mapped = real_status

    if mapped != db_status:
        projects_collection.update_one({"_id": project["_id"]}, {"$set": {"status": mapped}})
        project["status"] = mapped

    return project


def serialize_project(p):
    return {
        "id": str(p["_id"]),
        "name": p["name"],
        "language": p["language"],
        "status": p.get("status", "not_created"),
        "containerId": p.get("containerId"),
        "cpu": p.get("cpu"),
        "memoryMb": p.get("memoryMb"),
        "storageMb": p.get("storageMb"),
        "startedAt": p.get("startedAt"),
        "createdAt": p.get("createdAt"),
    }


@projects_bp.route("", methods=["GET"])
@require_auth
def list_projects():
    projects = list(projects_collection.find({"userId": request.user_id}).sort("createdAt", -1))
    projects = [_reconcile_status(p) for p in projects]
    return jsonify([serialize_project(p) for p in projects])


@projects_bp.route("/<project_id>", methods=["GET"])
@require_auth
def get_project(project_id):
    try:
        project = projects_collection.find_one({"_id": ObjectId(project_id), "userId": request.user_id})
    except Exception:
        return jsonify({"message": "Project not found"}), 404

    if not project:
        return jsonify({"message": "Project not found"}), 404

    project = _reconcile_status(project)
    return jsonify(serialize_project(project))


@projects_bp.route("", methods=["POST"])
@require_auth
def create_project():
    data = request.get_json() or {}
    name = data.get("name")
    language = data.get("language")

    if not name or not language:
        return jsonify({"message": "name and language are required"}), 400
    if language not in ALLOWED_LANGUAGES:
        return jsonify({"message": f"language must be one of {sorted(ALLOWED_LANGUAGES)}"}), 400

    project_doc = {
        "userId": request.user_id,
        "name": name,
        "language": language,
        "status": "not_created",
        "containerId": None,
        "cpu": None,
        "memoryMb": None,
        "storageMb": None,
        "startedAt": None,
        "createdAt": datetime.utcnow().isoformat(),
    }
    result = projects_collection.insert_one(project_doc)
    project_doc["_id"] = result.inserted_id

    return jsonify(serialize_project(project_doc)), 201


@projects_bp.route("/<project_id>", methods=["DELETE"])
@require_auth
def delete_project(project_id):
    project = projects_collection.find_one({"_id": ObjectId(project_id), "userId": request.user_id})
    if not project:
        return jsonify({"message": "Project not found"}), 404

    if project.get("containerId"):
        try:
            docker_manager.destroy_container(project["containerId"])
        except docker_manager.ContainerError as e:
            print(f"\n\n=== PROJECT DELETE: CONTAINER CLEANUP FAILED ===\n{e}\n=== END ===\n\n")
            return jsonify({"message": "Unable to remove the project's container. Please try again."}), 500

    projects_collection.delete_one({"_id": ObjectId(project_id)})
    return jsonify({"message": "Project deleted"})