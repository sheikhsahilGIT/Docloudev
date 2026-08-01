import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

client = MongoClient(os.getenv("MONGO_URI"))
db = client.get_default_database()

users_collection = db["users"]
projects_collection = db["projects"]