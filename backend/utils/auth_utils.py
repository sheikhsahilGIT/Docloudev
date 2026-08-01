import os
import jwt
import bcrypt
import datetime
from functools import wraps
from flask import request, jsonify

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", 168))


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_password(plain_password: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed.encode("utf-8"))


def generate_token(user_id: str) -> str:
    payload = {
        "userId": user_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str):
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"message": "No token provided"}), 401
        token = auth_header.split(" ")[1]
        try:
            decoded = decode_token(token)
            request.user_id = decoded["userId"]
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated