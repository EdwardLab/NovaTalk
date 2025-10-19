from datetime import datetime

from app import db


class FriendRequest(db.Model):
    __tablename__ = "friend_requests"

    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default="pending")

    sender = db.relationship("User", foreign_keys=[sender_id], backref="sent_friend_requests")
    receiver = db.relationship("User", foreign_keys=[receiver_id], backref="received_friend_requests")

    __table_args__ = (db.UniqueConstraint("sender_id", "receiver_id", name="uniq_friend_request"),)


class Friendship(db.Model):
    __tablename__ = "friendships"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    friend_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", foreign_keys=[user_id], backref="friends")
    friend = db.relationship("User", foreign_keys=[friend_id])

    __table_args__ = (db.UniqueConstraint("user_id", "friend_id", name="uniq_friendship"),)


class BlockedUser(db.Model):
    __tablename__ = "blocked_users"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    blocked_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", foreign_keys=[user_id], backref="blocked")
    blocked_user = db.relationship("User", foreign_keys=[blocked_user_id])

    __table_args__ = (db.UniqueConstraint("user_id", "blocked_user_id", name="uniq_block"),)
