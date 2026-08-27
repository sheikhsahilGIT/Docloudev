import os
import shutil
from flask import Blueprint, request, jsonify
from bson import ObjectId
from models.db import projects_collection
from utils.auth_utils import require_auth
from services.docker_manager import WORKSPACES_ROOT

files_bp = Blueprint("files", __name__)

def _safe_execute(fn, *args, **kwargs):
    """Runs a file operation and converts any unexpected error into a
    clean message — never lets a raw traceback reach the browser, even
    with Flask's debug mode on."""
    try:
        return fn(*args, **kwargs), None
    except ValueError:
        raise
    except Exception as e:
        print(f"\n\n=== FILE OPERATION FAILED ===\n{e}\n=== END ===\n\n")
        return None, "A file system error occurred. Please try again."


def _get_owned_project(project_id, owner_id):
    try:
        return projects_collection.find_one({"_id": ObjectId(project_id), "userId": owner_id})
    except Exception:
        return None


def _workspace_dir(project_id):
    # Same folder Phase 3's docker_manager.py bind-mounts into the
    # container at /workspace — not a separate Phase 4 filesystem.
    path = os.path.abspath(os.path.join(WORKSPACES_ROOT, project_id))
    os.makedirs(path, exist_ok=True)
    return path


def _safe_path(project_id, rel_path):
    """Resolves rel_path inside the project's workspace folder, and
    blocks path traversal (e.g. '../../etc/passwd') so a project can
    never read or write outside its own workspace."""
    base = _workspace_dir(project_id)
    target = os.path.abspath(os.path.join(base, rel_path.lstrip("/\\")))
    if not (target == base or target.startswith(base + os.sep)):
        raise ValueError("Invalid path")
    return target


@files_bp.route("/<project_id>/files", methods=["GET"])
@require_auth
def list_files(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404

    base = _workspace_dir(project_id)
    tree = []
    for root, dirs, files in os.walk(base):
        rel_root = os.path.relpath(root, base)
        for d in sorted(dirs):
            p = d if rel_root == "." else os.path.join(rel_root, d)
            tree.append({"path": p.replace("\\", "/"), "type": "dir"})
        for f in sorted(files):
            p = f if rel_root == "." else os.path.join(rel_root, f)
            tree.append({"path": p.replace("\\", "/"), "type": "file"})
    return jsonify(tree)


@files_bp.route("/<project_id>/files/content", methods=["GET"])
@require_auth
def read_file(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404

    rel_path = request.args.get("path", "")
    try:
        target = _safe_path(project_id, rel_path)
    except ValueError:
        return jsonify({"message": "Invalid path"}), 400

    if not os.path.isfile(target):
        return jsonify({"message": "File not found"}), 404

    try:
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        print(f"\n\n=== FILE READ FAILED ===\n{e}\n=== END ===\n\n")
        return jsonify({"message": "Unable to read this file."}), 500

    return jsonify({"content": content})


MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB — generous for source code


@files_bp.route("/<project_id>/files/content", methods=["PUT"])
@require_auth
def write_file(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404

    data = request.get_json() or {}
    rel_path = data.get("path", "")
    content = data.get("content", "")

    if len(content.encode("utf-8")) > MAX_FILE_SIZE_BYTES:
        return jsonify({"message": "File is too large to save (10 MB limit)."}), 413

    try:
        target = _safe_path(project_id, rel_path)
    except ValueError:
        return jsonify({"message": "Invalid path"}), 400

    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"\n\n=== FILE WRITE FAILED ===\n{e}\n=== END ===\n\n")
        return jsonify({"message": "Unable to save this file."}), 500

    return jsonify({"message": "Saved"})


# Characters that are invalid in filenames on Windows (and safest to
# just disallow everywhere for consistency), plus an empty name.
_INVALID_NAME_CHARS = set('<>:"|?*')


def _validate_name(rel_path):
    stripped = rel_path.strip()
    if not stripped:
        raise ValueError("Name cannot be empty")
    # The final segment is the actual file/folder name being created.
    final_segment = stripped.replace("\\", "/").rstrip("/").split("/")[-1]
    if not final_segment:
        raise ValueError("Name cannot be empty")
    if any(c in _INVALID_NAME_CHARS for c in final_segment):
        raise ValueError('Name cannot contain: < > : " | ? *')
    if final_segment in (".", ".."):
        raise ValueError("Invalid name")


@files_bp.route("/<project_id>/files", methods=["POST"])
@require_auth
def create_file_or_folder(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404

    data = request.get_json() or {}
    rel_path = data.get("path", "")
    item_type = data.get("type", "file")

    try:
        _validate_name(rel_path)
        target = _safe_path(project_id, rel_path)
    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    if os.path.exists(target):
        return jsonify({"message": "A file or folder with that name already exists"}), 409

    if item_type == "dir":
        os.makedirs(target, exist_ok=True)
    else:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        open(target, "w").close()

    return jsonify({"message": "Created"}), 201


@files_bp.route("/<project_id>/files/rename", methods=["PUT"])
@require_auth
def rename_file_or_folder(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404

    data = request.get_json() or {}
    old_path = data.get("oldPath", "")
    new_path = data.get("newPath", "")

    try:
        old_target = _safe_path(project_id, old_path)
        new_target = _safe_path(project_id, new_path)
    except ValueError:
        return jsonify({"message": "Invalid path"}), 400

    if not os.path.exists(old_target):
        return jsonify({"message": "Not found"}), 404
    if os.path.exists(new_target):
        return jsonify({"message": "A file with that name already exists"}), 409

    os.makedirs(os.path.dirname(new_target), exist_ok=True)
    os.rename(old_target, new_target)
    return jsonify({"message": "Renamed"})


@files_bp.route("/<project_id>/files", methods=["DELETE"])
@require_auth
def delete_file_or_folder(project_id):
    project = _get_owned_project(project_id, request.user_id)
    if not project:
        return jsonify({"message": "Project not found"}), 404

    rel_path = request.args.get("path", "")
    try:
        target = _safe_path(project_id, rel_path)
    except ValueError:
        return jsonify({"message": "Invalid path"}), 400

    if os.path.isdir(target):
        shutil.rmtree(target)
    elif os.path.isfile(target):
        os.remove(target)
    else:
        return jsonify({"message": "Not found"}), 404

    return jsonify({"message": "Deleted"})