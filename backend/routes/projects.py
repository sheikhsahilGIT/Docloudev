from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from models.db import projects_collection
from utils.auth_utils import require_auth
from services import docker_manager

projects_bp = Blueprint("projects", __name__)

# Per the container orchestration spec: CloudDev supports exactly these
# three languages — no JavaScript, no others.
ALLOWED_LANGUAGES = {"python", "java", "cpp"}


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
    projects = projects_collection.find({"userId": request.user_id}).sort("createdAt", -1)
    return jsonify([serialize_project(p) for p in projects])


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
            return jsonify({"message": f"Could not remove container: {e}"}), 500

    projects_collection.delete_one({"_id": ObjectId(project_id)})
    return jsonify({"message": "Project deleted"})