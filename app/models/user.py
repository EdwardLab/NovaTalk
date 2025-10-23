import os
from datetime import datetime

from flask import current_app
from flask_login import UserMixin
from sqlalchemy.orm import reconstructor, validates
from werkzeug.security import check_password_hash, generate_password_hash

from app import db
from app.utils.datetime import to_utc_iso


DEFAULT_TIMEZONE_MODE = "system"
DEFAULT_TIMEZONE_OFFSET = 0
DEFAULT_DATETIME_FORMAT = "MM/DD/YYYY HH:mm"
ALLOWED_DATETIME_FORMATS = (
    "MM/DD/YYYY HH:mm",
    "DD/MM/YYYY HH:mm",
    "YYYY-MM-DD HH:mm",
)


class Avatar(db.Model):
    __tablename__ = "avatars"

    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def file_path(self):
        return os.path.join(current_app.config["UPLOAD_FOLDER"], "avatars", self.filename)


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    display_name = db.Column(db.String(120), nullable=False)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(512), nullable=False)
    bio = db.Column(db.Text, default="", nullable=False)
    avatar_id = db.Column(db.Integer, db.ForeignKey("avatars.id"))
    is_admin = db.Column(db.Boolean, default=False)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    online = db.Column(db.Boolean, default=False)
    timezone_mode = db.Column(db.String(20), default=DEFAULT_TIMEZONE_MODE, nullable=False)
    timezone_offset = db.Column(db.Integer, default=DEFAULT_TIMEZONE_OFFSET, nullable=False)
    datetime_format = db.Column(db.String(32), default=DEFAULT_DATETIME_FORMAT, nullable=False)

    avatar = db.relationship("Avatar", backref=db.backref("user", uselist=False))

    sent_messages = db.relationship("Message", foreign_keys="Message.sender_id", backref="sender", lazy="dynamic")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._normalize_loaded_values()

    @reconstructor
    def init_on_load(self):
        self._normalize_loaded_values()

    def _normalize_loaded_values(self):
        if self.username:
            sanitized = self.username.strip().lower().lstrip("@")
            if sanitized != self.username:
                self.username = sanitized
        if not self.timezone_mode:
            self.timezone_mode = DEFAULT_TIMEZONE_MODE
        if self.timezone_offset is None:
            self.timezone_offset = DEFAULT_TIMEZONE_OFFSET
        if not self.datetime_format:
            self.datetime_format = DEFAULT_DATETIME_FORMAT

    @validates("username", "email")
    def _normalize_identity(self, key, value):
        if value is None:
            return value
        normalized = value.strip().lower()
        if key == "username":
            normalized = normalized.lstrip("@")
        return normalized

    def set_password(self, password: str) -> None:
        if not password:
            raise ValueError("Password must not be empty.")
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        if not self.password_hash or password is None:
            return False
        return check_password_hash(self.password_hash, password)

    def set_online(self):
        self.online = True
        self.last_seen = datetime.utcnow()
        db.session.commit()

    def set_offline(self):
        self.online = False
        self.last_seen = datetime.utcnow()
        db.session.commit()

    @property
    def avatar_url(self):
        if not self.avatar:
            return None
        timestamp = int(self.avatar.created_at.timestamp()) if self.avatar.created_at else int(datetime.utcnow().timestamp())
        return f"/media/avatars/{self.avatar.filename}?v={timestamp}"

    def to_public_dict(self):
        return {
            "id": self.id,
            "display_name": self.display_name,
            "username": self.username,
            "avatar": self.avatar_url,
            "bio": self.bio,
            "online": self.online,
            "last_seen": to_utc_iso(self.last_seen),
        }

    def settings_payload(self):
        return {
            "timezone": {
                "mode": self.timezone_mode or DEFAULT_TIMEZONE_MODE,
                "offset": int(self.timezone_offset or 0),
            },
            "datetime_format": self.datetime_format or DEFAULT_DATETIME_FORMAT,
        }

    def __repr__(self):
        return f"<User {self.username}>"
