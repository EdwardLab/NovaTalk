from datetime import datetime

from app import db


class Chat(db.Model):
    __tablename__ = "chats"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=True)
    is_group = db.Column(db.Boolean, default=False)
    creator_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    members = db.relationship("ChatMember", backref="chat", cascade="all, delete-orphan", lazy="dynamic")
    messages = db.relationship("Message", backref="chat", cascade="all, delete-orphan", lazy="dynamic")
    creator = db.relationship("User", foreign_keys=[creator_id])

    def has_member(self, user_id: int) -> bool:
        return self.members.filter_by(user_id=user_id).count() > 0

    def get_admins(self):
        return [member.user for member in self.members.filter_by(is_admin=True)]

    def get_owner(self):
        return self.members.filter_by(is_owner=True).first()


class ChatMember(db.Model):
    __tablename__ = "chat_members"

    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey("chats.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    is_owner = db.Column(db.Boolean, default=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", backref=db.backref("chat_memberships", cascade="all, delete-orphan"))

    __table_args__ = (db.UniqueConstraint("chat_id", "user_id", name="uniq_chat_user"),)


class GroupInvite(db.Model):
    __tablename__ = "group_invites"

    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey("chats.id"), nullable=False)
    inviter_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    invitee_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    status = db.Column(db.String(20), default="pending")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    responded_at = db.Column(db.DateTime, nullable=True)

    inviter = db.relationship("User", foreign_keys=[inviter_id])
    invitee = db.relationship("User", foreign_keys=[invitee_id])
    group = db.relationship(
        "Chat",
        foreign_keys=[chat_id],
        backref=db.backref("group_invites", cascade="all, delete-orphan"),
    )

    __table_args__ = (
        db.UniqueConstraint("chat_id", "invitee_id", name="uniq_group_invite"),
    )

    @property
    def chat(self):
        return self.group

    @chat.setter
    def chat(self, value):
        self.group = value
