import os
from typing import Optional

import motor.motor_asyncio
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

_client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None


def get_client() -> motor.motor_asyncio.AsyncIOMotorClient:
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI environment variable is not set")
        _client = motor.motor_asyncio.AsyncIOMotorClient(uri)
    return _client


def get_db():
    return get_client()["jobhunt"]


async def close_client():
    global _client
    if _client is not None:
        _client.close()
        _client = None


def serialize_doc(doc: dict) -> dict:
    """Recursively make a MongoDB document JSON-serialisable."""
    result = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            result["id" if k == "_id" else k] = str(v)
        elif isinstance(v, dict):
            result[k] = serialize_doc(v)
        elif isinstance(v, list):
            result[k] = [
                serialize_doc(i) if isinstance(i, dict) else str(i) if isinstance(i, ObjectId) else i
                for i in v
            ]
        else:
            result[k] = v
    return result
