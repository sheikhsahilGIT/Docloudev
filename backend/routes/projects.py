from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from models.db import projects_collection
from utils.auth_utils import require_auth

projects_bp = Blueprint("projects", __name__)
ALLOWED_LANGUAGES = {"python", "javascript", "java", "cpp"}


def serialize_project(p):
    return {
        "id": str(p["_id"]), "name": p["name"], "language": p["language"],
        "status": p.get("status", "stopped"), "containerId": p.get("containerId"),
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
        "userId": request.user_id, "name": name, "language": language,
        "status": "stopped", "containerId": None,
        "createdAt": datetime.utcnow().isoformat(),
    }
    result = projects_collection.insert_one(project_doc)
    project_doc["_id"] = result.inserted_id
    return jsonify(serialize_project(project_doc)), 201


@projects_bp.route("/<project_id>", methods=["DELETE"])
@require_auth
def delete_project(project_id):
    result = projects_collection.delete_one({"_id": ObjectId(project_id), "userId": request.user_id})
    if result.deleted_count == 0:
        return jsonify({"message": "Project not found"}), 404
    return jsonify({"message": "Project deleted"})