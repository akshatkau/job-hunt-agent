"""Pydantic models for request/response validation."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, EmailStr


# ── User ───────────────────────────────────────────────────────────────────────

class UserPreferences(BaseModel):
    roles: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    location: list[str] = Field(default_factory=list)
    salary_min: Optional[int] = None
    experience: int = 0


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    resume_text: str = ""
    preferences: UserPreferences = Field(default_factory=UserPreferences)


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    resume_text: str
    preferences: UserPreferences
    created_at: Optional[str] = None
    google_id: Optional[str] = None
    picture: Optional[str] = None


# ── Job ────────────────────────────────────────────────────────────────────────

class JobResponse(BaseModel):
    id: str
    user_id: str
    title: str
    company: str
    platform: str
    location: str
    url: str
    description: str = ""
    fit_score: int = 0
    fit_reason: str = ""
    status: str = "new"
    scraped_at: Optional[str] = None
    posted_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None


class JobStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        description="One of: new | saved | applied | rejected | interview",
    )


class ScrapeRequest(BaseModel):
    user_id: str
    preferences: Optional[UserPreferences] = None
    resume_text: Optional[str] = None


class JobFilters(BaseModel):
    platform: Optional[str] = None
    status: Optional[str] = None
    min_score: Optional[int] = None
    posted_within_hours: Optional[int] = None
    limit: int = 50


class UserUpdate(BaseModel):
    name: Optional[str] = None
    resume_text: Optional[str] = None
    preferences: Optional[UserPreferences] = None
