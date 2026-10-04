import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def gen_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), default="")
    role = Column(String(50), default="designer", index=True)
    token_version = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Goal(Base):
    __tablename__ = "goals"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    goal_type = Column(String(50), default="Daily")
    category = Column(String(100), default="Pitching")
    goal_name = Column(String(500), nullable=False)
    target_number = Column(Float, default=0)
    unit = Column(String(100), default="")
    owner = Column(String(100), default="Founder")
    founder_responsibility = Column(Text, default="")
    designer_responsibility = Column(Text, default="")
    frequency = Column(String(50), default="Daily")
    status = Column(String(50), default="Active", index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Task(Base):
    __tablename__ = "tasks"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    date = Column(String(10), index=True)
    task_type = Column(String(50), default="Founder Task", index=True)
    work_category = Column(String(100), default="Internal Work")
    task_name = Column(String(500), nullable=False)
    assigned_to = Column(String(100), default="")
    brief = Column(Text, default="")
    priority = Column(String(50), default="Medium")
    manager_deadline = Column(String(50), default="")
    committed_time = Column(String(50), default="")
    status = Column(String(50), default="Pending", index=True)
    delay_reason = Column(Text, default="")
    output_link = Column(Text, default="")
    review_notes = Column(Text, default="")
    target_number = Column(Float, nullable=True)
    unit = Column(String(100), default="")
    goal_id = Column(String(36), nullable=True, index=True)
    auto_generated = Column(Boolean, default=False)
    saved = Column(Boolean, default=False, index=True)
    saved_at = Column(DateTime(timezone=True), nullable=True)
    start_time = Column(String(20), default="", nullable=True)
    end_time = Column(String(20), default="", nullable=True)
    sort_order = Column(Integer, default=0, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key = Column(String(100), primary_key=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime(timezone=True), default=utcnow)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    identifier = Column(String(255), index=True)
    email = Column(String(255), index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class PasswordResetRequest(Base):
    __tablename__ = "password_reset_requests"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(255), index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    token_hash = Column(String(128), unique=True, index=True)
    user_id = Column(String(36))
    email = Column(String(255))
    expires_at = Column(DateTime(timezone=True))
    used = Column(Boolean, default=False)
