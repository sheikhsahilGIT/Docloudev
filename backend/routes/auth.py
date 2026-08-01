from flask import Blueprint, request, jsonify
from models.db import users_collection
from utils.auth_utils import hash_password, check_password, generate_token

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/signup", methods=["POST"])
def signup():
    data = request.get_json() or {}
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    if not name or not email or not password:
        return jsonify({"message": "All fields are required"}), 400
    if users_collection.find_one({"email": email}):
        return jsonify({"message": "Email already registered"}), 409

    user_doc = {"name": name, "email": email, "passwordHash": hash_password(password)}
    result = users_collection.insert_one(user_doc)
    user_id = str(result.inserted_id)
    token = generate_token(user_id)

    return jsonify({"token": token, "user": {"id": user_id, "name": name, "email": email}}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email")
    password = data.get("password")

    user = users_collection.find_one({"email": email})
    if not user or not check_password(password, user["passwordHash"]):
        return jsonify({"message": "Invalid credentials"}), 401

    user_id = str(user["_id"])
    token = generate_token(user_id)
    return jsonify({"token": token, "user": {"id": user_id, "name": user["name"], "email": user["email"]}})