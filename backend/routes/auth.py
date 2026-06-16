from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from backend.auth import create_jwt, verify_google_token
from backend.database import get_db, serialize_doc

router = APIRouter()


class GoogleTokenRequest(BaseModel):
    token: str


@router.post("/google")
async def google_auth(body: GoogleTokenRequest):
    google_data = verify_google_token(body.token)

    db = get_db()
    user = await db.users.find_one_and_update(
        {"google_id": google_data["google_id"]},
        {
            "$set": {
                "google_id": google_data["google_id"],
                "email":     google_data["email"],
                "name":      google_data["name"],
                "picture":   google_data["picture"],
            },
            "$setOnInsert": {
                "preferences": {
                    "roles": [], "skills": [], "location": [], "experience": 0
                },
                "resume_text": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        },
        upsert=True,
        return_document=True,
    )

    user_id = str(user["_id"])
    access_token = create_jwt(user_id)

    return {
        "access_token": access_token,
        "user_id":      user_id,
        "name":         user["name"],
        "email":        user["email"],
        "picture":      user.get("picture", ""),
        "resume_text":  user.get("resume_text", ""),
    }
