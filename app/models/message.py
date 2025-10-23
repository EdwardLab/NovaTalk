from datetime import datetime

from markupsafe import Markup
from sqlalchemy.orm import validates

from app import db
from app.utils.datetime import to_utc_iso


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey("chats.id"), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    body = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    attachments = db.relationship("MessageAttachment", backref="message", cascade="all, delete-orphan")

    @validates("body")
    def _coerce_body(self, _, value):
        if value is None:
            return None
        if isinstance(value, Markup):
            return str(value)
        return value

    def to_dict(self):
        return {
            "id": self.id,
            "chat_id": self.chat_id,
            "sender_id": self.sender_id,
            "body": self.body,
            "created_at": to_utc_iso(self.created_at),
            "attachments": [attachment.to_dict() for attachment in self.attachments],
        }


class MessageAttachment(db.Model):
    __tablename__ = "message_attachments"

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id"), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    mimetype = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def public_url(self):
        timestamp = int(self.created_at.timestamp()) if self.created_at else int(datetime.utcnow().timestamp())
        return f"/media/messages/{self.filename}?v={timestamp}"

    def to_dict(self):
        return {
            "id": self.id,
            "url": self.public_url,
            "mimetype": self.mimetype,
            "filename": self.filename,
        }
