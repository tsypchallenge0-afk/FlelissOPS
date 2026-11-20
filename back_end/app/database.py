import os
import re
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "poultry_db")

# Never print credentials: mask the password part of the URL
print("Using MongoDB:", re.sub(r"//([^:/@]+):[^@]*@", r"//\1:***@", MONGO_URL), "| database:", DATABASE_NAME)

client = MongoClient(
    MONGO_URL,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
)

db = client[DATABASE_NAME]
