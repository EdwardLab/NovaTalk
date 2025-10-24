import base64
import binascii
import json
import os
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, abort, current_app, render_template, request, send_from_directory
from flask_login import current_user, login_required
from flask_socketio import join_room, leave_room
from sqlalchemy import and_, func, or_
from werkzeug.datastructures import FileStorage

from app import db, socketio
from app.models import (
    Avatar,
    BlockedUser,
    Chat,
    ChatMember,
    FriendRequest,
    Friendship,
    GroupInvite,
    Message,
    MessageAttachment,
    User,
)
from app.models.user import (
    ALLOWED_DATETIME_FORMATS,
    DEFAULT_DATETIME_FORMAT,
    DEFAULT_TIMEZONE_MODE,
    DEFAULT_TIMEZONE_OFFSET,
)
from app.utils.datetime import to_utc_iso
from app.utils.storage import remove_file, save_avatar, save_message_image

VALID_TIMEZONE_MODES = {"system", "custom"}
MIN_TIMEZONE_OFFSET = -12 * 60
MAX_TIMEZONE_OFFSET = 14 * 60
TIMEZONE_STEP = 30

chat_bp = Blueprint("chat", __name__)


def _are_mutual_friends(user_id: int, other_user_id: int) -> bool:
    if user_id == other_user_id:
        return True
    return bool(
        Friendship.query.filter_by(user_id=user_id, friend_id=other_user_id).first()
        and Friendship.query.filter_by(user_id=other_user_id, friend_id=user_id).first()
    )


def _serialize_member(member: ChatMember) -> Dict[str, Any]:
    return {
        "id": member.id,
        "user": member.user.to_public_dict(),
        "is_admin": member.is_admin,
        "joined_at": to_utc_iso(member.joined_at),
    }


def _chat_partner(members: List[ChatMember], user_id: int) -> Optional[User]:
    for member in members:
        if member.user_id != user_id:
            return member.user
    return None


def _serialize_message(message: Message) -> Dict[str, Any]:
    payload = message.to_dict()
    payload["sender"] = message.sender.to_public_dict() if message.sender else None
    return payload


def _serialize_chat_summary(chat: Chat, user: User) -> Dict[str, Any]:
    members = list(chat.members.order_by(ChatMember.joined_at.asc()))
    partner = _chat_partner(members, user.id) if not chat.is_group else None
    latest_message = chat.messages.order_by(Message.created_at.desc()).first()
    last_timestamp = to_utc_iso(latest_message.created_at if latest_message else chat.created_at)
    return {
        "id": chat.id,
        "is_group": chat.is_group,
        "name": chat.name
        if chat.is_group and chat.name
        else (partner.display_name if partner else "Conversation"),
        "created_at": to_utc_iso(chat.created_at),
        "updated_at": last_timestamp,
        "members": [_serialize_member(member) for member in members],
        "partner": partner.to_public_dict() if partner else None,
        "last_message": _serialize_message(latest_message) if latest_message else None,
        "can_message": chat.is_group or (partner and _are_mutual_friends(user.id, partner.id)),
        "creator": chat.creator.to_public_dict() if chat.creator else None,
    }


def _serialize_chat_detail(chat: Chat, user: User) -> Dict[str, Any]:
    summary = _serialize_chat_summary(chat, user)
    summary["members"] = [_serialize_member(member) for member in chat.members.order_by(ChatMember.joined_at.asc())]
    return summary


def _serialize_group_invite(invite: GroupInvite) -> Dict[str, Any]:
    group = invite.group
    if group is None and invite.chat_id:
        group = Chat.query.get(invite.chat_id)
    return {
        "id": invite.id,
        "chat_id": invite.chat_id,
        "chat_name": group.name if group else None,
        "group_id": group.id if group else invite.chat_id,
        "group_name": group.name if group else None,
        "created_at": to_utc_iso(invite.created_at),
        "status": invite.status,
        "inviter": invite.inviter.to_public_dict() if invite.inviter else None,
        "invitee": invite.invitee.to_public_dict() if invite.invitee else None,
    }


def _collect_contacts(user: User) -> Dict[str, Any]:
    friends = [
        {
            "id": relation.id,
            "user": relation.friend.to_public_dict(),
            "since": to_utc_iso(relation.created_at),
        }
        for relation in user.friends
    ]
    incoming = [
        {
            "id": request_obj.id,
            "user": request_obj.sender.to_public_dict(),
            "created_at": to_utc_iso(request_obj.created_at),
            "status": request_obj.status,
        }
        for request_obj in user.received_friend_requests
        if request_obj.status == "pending"
    ]
    outgoing = [
        {
            "id": request_obj.id,
            "user": request_obj.receiver.to_public_dict(),
            "created_at": to_utc_iso(request_obj.created_at),
            "status": request_obj.status,
        }
        for request_obj in user.sent_friend_requests
        if request_obj.status == "pending"
    ]
    group_invites = _collect_group_invites(user)
    return {
        "friends": friends,
        "incoming": incoming,
        "outgoing": outgoing,
        "group_invites": group_invites,
    }


def _collect_group_invites(user: User) -> Dict[str, Any]:
    incoming = [
        _serialize_group_invite(invite)
        for invite in GroupInvite.query.filter_by(invitee_id=user.id, status="pending").all()
    ]
    outgoing = [
        _serialize_group_invite(invite)
        for invite in GroupInvite.query.filter_by(inviter_id=user.id, status="pending").all()
    ]
    return {"incoming": incoming, "outgoing": outgoing}


def _find_user_by_identifier(identifier: Any) -> Optional[User]:
    if identifier is None:
        return None
    if isinstance(identifier, User):
        return identifier
    if isinstance(identifier, dict):
        if "user_id" in identifier:
            return _find_user_by_identifier(identifier.get("user_id"))
        if "username" in identifier:
            return _find_user_by_identifier(identifier.get("username"))
    if isinstance(identifier, int):
        return User.query.get(identifier)
    if isinstance(identifier, str):
        value = identifier.strip()
        if not value:
            return None
        if value.isdigit():
            candidate = User.query.get(int(value))
            if candidate:
                return candidate
        normalized = value.lower().lstrip("@")
        if not normalized:
            return None
        return (
            User.query.filter(
                func.lower(User.username).in_([normalized, f"@{normalized}"])
            ).first()
        )
    return None


def _resolve_invitees(*values: Any) -> List[User]:
    identifiers: List[Any] = []
    for value in values:
        if not value:
            continue
        if isinstance(value, str):
            parts = [part.strip() for part in value.split(",")]
            identifiers.extend(filter(None, parts))
        elif isinstance(value, (list, tuple, set)):
            identifiers.extend(value)
        elif isinstance(value, dict):
            identifiers.extend(value.values())
        else:
            identifiers.append(value)
    resolved: List[User] = []
    seen_ids = set()
    for identifier in identifiers:
        user = _find_user_by_identifier(identifier)
        if user and user.id not in seen_ids:
            seen_ids.add(user.id)
            resolved.append(user)
    return resolved


def _sanitize_timezone_mode(value: Any) -> str:
    if value is None:
        return DEFAULT_TIMEZONE_MODE
    mode = str(value).strip().lower()
    if mode not in VALID_TIMEZONE_MODES:
        return DEFAULT_TIMEZONE_MODE
    return mode


def _sanitize_timezone_offset(value: Any) -> int:
    if value is None:
        minutes = DEFAULT_TIMEZONE_OFFSET
    else:
        try:
            minutes = int(round(float(value)))
        except (TypeError, ValueError):
            minutes = DEFAULT_TIMEZONE_OFFSET
    minutes = int(round(minutes / TIMEZONE_STEP) * TIMEZONE_STEP)
    minutes = max(MIN_TIMEZONE_OFFSET, min(MAX_TIMEZONE_OFFSET, minutes))
    return minutes


def _sanitize_datetime_format(value: Any) -> str:
    if value is None:
        return DEFAULT_DATETIME_FORMAT
    text = str(value).strip()
    return text if text in ALLOWED_DATETIME_FORMATS else DEFAULT_DATETIME_FORMAT


def _initial_state_for_user(
    user: User,
    active_chat_id: Optional[int] = None,
    chats_override: Optional[List[Chat]] = None,
    active_tab: Optional[str] = None,
) -> Dict[str, Any]:
    chats = chats_override or (
        Chat.query.join(ChatMember)
        .filter(ChatMember.user_id == user.id)
        .order_by(Chat.created_at.desc())
        .all()
    )
    serialized_chats = [_serialize_chat_summary(chat, user) for chat in chats]
    contacts = _collect_contacts(user)
    group_invite_count = len(contacts.get("group_invites", {}).get("incoming", []))
    ui_state: Dict[str, Any] = {
        "activeChatId": active_chat_id,
        "pendingCount": len(contacts["incoming"]),
        "pendingGroupInvites": group_invite_count,
    }
    if active_tab:
        ui_state["activeTab"] = active_tab
    return {
        "user": {
            **user.to_public_dict(),
            "email": user.email,
            "settings": user.settings_payload(),
        },
        "chats": serialized_chats,
        "contacts": contacts,
        "ui": ui_state,
    }


def _persist_attachment(payload: Dict[str, Any]) -> Tuple[str, str]:
    raw_data = payload.get("data")
    if not raw_data:
        raise ValueError("Attachment data missing.")
    name = (payload.get("name") or "attachment").strip() or "attachment"
    if "." not in name:
        name = f"{name}.png"
    mimetype = payload.get("mimetype") or "image/png"
    if "," in raw_data:
        _, raw_data = raw_data.split(",", 1)
    try:
        binary = base64.b64decode(raw_data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid attachment encoding.") from exc
    if not binary:
        raise ValueError("Attachment payload empty.")
    stream = BytesIO(binary)
    stream.seek(0)
    storage = FileStorage(stream=stream, filename=name, content_type=mimetype)
    filename = save_message_image(storage)
    return filename, mimetype


def _persist_avatar(payload: Dict[str, Any], existing_filename: Optional[str] = None) -> str:
    raw_data = payload.get("data")
    if not raw_data:
        raise ValueError("Avatar data missing.")
    name = (payload.get("name") or "avatar").strip() or "avatar"
    if "." not in name:
        name = f"{name}.png"
    mimetype = payload.get("mimetype") or "image/png"
    if "," in raw_data:
        _, raw_data = raw_data.split(",", 1)
    try:
        binary = base64.b64decode(raw_data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid avatar encoding.") from exc
    if not binary:
        raise ValueError("Avatar payload empty.")
    stream = BytesIO(binary)
    stream.seek(0)
    storage = FileStorage(stream=stream, filename=name, content_type=mimetype)
    return save_avatar(storage, existing_filename=existing_filename)


def _broadcast_contacts(user: User) -> None:
    contacts = _collect_contacts(user)
    payload = {"contacts": contacts}
    friend_pending = len(contacts.get("incoming", []))
    group_pending = len(contacts.get("group_invites", {}).get("incoming", []))
    payload["pendingCount"] = friend_pending
    payload["pendingGroupInvites"] = group_pending
    payload["pendingTotal"] = friend_pending + group_pending
    socketio.emit("contacts:update", payload, room=f"user_{user.id}")


@chat_bp.before_app_request
def update_last_seen():
    if current_user.is_authenticated:
        current_user.last_seen = datetime.utcnow()
        current_user.online = True
        db.session.commit()


@chat_bp.route("/", defaults={"tab": "chats"}, endpoint="inbox")
@chat_bp.route("/friends", defaults={"tab": "contacts"}, endpoint="friends")
@chat_bp.route("/chat/<int:chat_id>", defaults={"tab": "chats"}, endpoint="view_chat")
@login_required
def chat_app(chat_id: Optional[int] = None, tab: str = "chats"):
    resolved_chat_id = None
    if chat_id:
        chat = Chat.query.get(chat_id)
        if chat and chat.has_member(current_user.id):
            resolved_chat_id = chat.id
    active_tab = request.args.get("tab", tab)
    initial_state = _initial_state_for_user(
        current_user,
        active_chat_id=resolved_chat_id,
        active_tab=active_tab,
    )
    state_json = json.dumps(initial_state, separators=(",", ":"))
    return render_template("chat/app.html", initial_state=state_json)


@chat_bp.route("/media/<path:category>/<path:filename>")
@login_required
def media(category: str, filename: str):
    safe_categories = {"avatars", "messages"}
    if category not in safe_categories:
        abort(404)
    directory = current_app.config["UPLOAD_FOLDER"]
    return send_from_directory(os.path.join(directory, category), filename)


def _emit_chat_history(chat: Chat, user: User) -> None:
    messages = chat.messages.order_by(Message.created_at.asc()).all()
    socketio.emit(
        "chat:history",
        {
            "ok": True,
            "chat_id": chat.id,
            "chat": _serialize_chat_detail(chat, user),
            "messages": [_serialize_message(message) for message in messages],
        },
        to=request.sid,
    )


@socketio.on("initialize")
def handle_initialize():
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    join_room(f"user_{current_user.id}")
    user_chats = (
        Chat.query.join(ChatMember)
        .filter(ChatMember.user_id == current_user.id)
        .order_by(Chat.created_at.desc())
        .all()
    )
    for chat in user_chats:
        join_room(f"chat_{chat.id}")
    state = _initial_state_for_user(current_user, active_chat_id=None, chats_override=user_chats)
    return {"ok": True, "state": state}


@socketio.on("chat:open")
def handle_chat_open(data):
    chat_id: Optional[int] = None
    if isinstance(data, dict):
        chat_id = data.get("chat_id")
    elif isinstance(data, (int, str)):
        try:
            chat_id = int(data)
        except (TypeError, ValueError):
            chat_id = None
    payload: Dict[str, Any] = {"ok": False, "chat_id": chat_id}
    if not current_user.is_authenticated:
        payload["error"] = "Unauthorized"
        socketio.emit("chat:history", payload, to=request.sid)
        return payload
    if not chat_id:
        payload["error"] = "Chat ID required"
        socketio.emit("chat:history", payload, to=request.sid)
        return payload
    chat = Chat.query.get(chat_id)
    if not chat or not chat.has_member(current_user.id):
        payload["error"] = "Chat not found"
        socketio.emit("chat:history", payload, to=request.sid)
        return payload
    join_room(f"chat_{chat.id}")
    _emit_chat_history(chat, current_user)
    payload = {
        "ok": True,
        "chat_id": chat.id,
        "chat": _serialize_chat_detail(chat, current_user),
    }
    return payload


@socketio.on("chat:leave")
def handle_chat_leave(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    chat_id: Optional[int] = None
    if isinstance(data, dict):
        chat_id = data.get("chat_id")
    elif isinstance(data, (int, str)):
        try:
            chat_id = int(data)
        except (TypeError, ValueError):
            chat_id = None
    if not chat_id:
        return {"ok": False, "error": "Chat ID required"}
    leave_room(f"chat_{chat_id}")
    return {"ok": True, "chat_id": chat_id}


@socketio.on("chat:typing")
def handle_chat_typing(data):
    if not current_user.is_authenticated:
        return
    chat_id = data.get("chat_id")
    if not chat_id:
        return
    chat = Chat.query.get(chat_id)
    if not chat or not chat.has_member(current_user.id):
        return
    socketio.emit(
        "chat:typing",
        {
            "chat_id": chat_id,
            "user": current_user.to_public_dict(),
            "is_typing": True,
        },
        room=f"chat_{chat_id}",
        include_self=False,
    )


@socketio.on("chat:stop_typing")
def handle_chat_stop_typing(data):
    if not current_user.is_authenticated:
        return
    chat_id = data.get("chat_id")
    if not chat_id:
        return
    chat = Chat.query.get(chat_id)
    if not chat or not chat.has_member(current_user.id):
        return
    socketio.emit(
        "chat:typing",
        {
            "chat_id": chat_id,
            "user": current_user.to_public_dict(),
            "is_typing": False,
        },
        room=f"chat_{chat_id}",
        include_self=False,
    )


@socketio.on("send_message")
def handle_send_message(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    chat_id = data.get("chat_id")
    raw_body = (data.get("body") or "").strip()
    attachments_payload = data.get("attachments") or []
    client_ref = data.get("client_ref")
    if not chat_id:
        return {"ok": False, "error": "Chat ID required"}
    chat = Chat.query.get(chat_id)
    if not chat or not chat.has_member(current_user.id):
        return {"ok": False, "error": "Chat not found"}
    if not chat.is_group:
        other_member = chat.members.filter(ChatMember.user_id != current_user.id).first()
        if other_member and not _are_mutual_friends(current_user.id, other_member.user_id):
            return {"ok": False, "error": "You must be friends before you can chat."}
    if not raw_body and not attachments_payload:
        return {"ok": False, "error": "Message cannot be empty."}

    member_ids = [
        member.user_id for member in chat.members if member.user_id != current_user.id
    ]
    if BlockedUser.query.filter(
        BlockedUser.user_id.in_(member_ids), BlockedUser.blocked_user_id == current_user.id
    ).first():
        return {"ok": False, "error": "You cannot send messages to this chat right now."}

    stored_files: List[Tuple[str, str]] = []
    if attachments_payload:
        for attachment in attachments_payload:
            try:
                stored = _persist_attachment(attachment)
                stored_files.append(stored)
            except ValueError as exc:
                for filename, _ in stored_files:
                    remove_file("messages", filename)
                return {"ok": False, "error": str(exc)}
            except Exception:  # pragma: no cover - safeguard
                current_app.logger.exception("Failed to persist attachment.")
                for filename, _ in stored_files:
                    remove_file("messages", filename)
                return {"ok": False, "error": "Failed to process attachment."}

    message = Message(chat_id=chat.id, sender_id=current_user.id, body=raw_body or None)
    db.session.add(message)
    try:
        db.session.flush()
        for filename, mimetype in stored_files:
            db.session.add(
                MessageAttachment(message_id=message.id, filename=filename, mimetype=mimetype)
            )
        db.session.commit()
    except Exception:
        db.session.rollback()
        for filename, _ in stored_files:
            remove_file("messages", filename)
        current_app.logger.exception("Failed to save message.")
        return {"ok": False, "error": "Failed to send message."}

    payload = _serialize_message(message)
    if client_ref:
        payload["client_ref"] = client_ref
    socketio.emit("new_message", payload, room=f"chat_{chat.id}")
    return {"ok": True, "message": payload}


@socketio.on("chat:create")
def handle_chat_create(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    chat_type = data.get("type", "direct")
    if chat_type not in {"direct", "group"}:
        return {"ok": False, "error": "Unsupported chat type"}

    if chat_type == "direct":
        target_user_id = data.get("user_id")
        username_input = (data.get("username") or "").strip().lower().lstrip("@")
        other_user: Optional[User] = None
        if target_user_id:
            other_user = User.query.get(target_user_id)
        elif username_input:
            other_user = (
                User.query.filter(
                    func.lower(User.username).in_([username_input, f"@{username_input}"])
                ).first()
            )
        if not other_user:
            return {"ok": False, "error": "User not found"}
        if other_user.id == current_user.id:
            return {"ok": False, "error": "You cannot start a chat with yourself."}
        if not _are_mutual_friends(current_user.id, other_user.id):
            return {"ok": False, "error": "You need to be friends before messaging."}
        existing_chat = (
            Chat.query.filter_by(is_group=False)
            .filter(Chat.members.any(user_id=current_user.id))
            .filter(Chat.members.any(user_id=other_user.id))
            .first()
        )
        if existing_chat:
            return {"ok": True, "chat": _serialize_chat_summary(existing_chat, current_user)}
        chat = Chat(is_group=False)
        db.session.add(chat)
        db.session.flush()
        db.session.add(ChatMember(chat_id=chat.id, user_id=current_user.id, is_admin=True))
        db.session.add(ChatMember(chat_id=chat.id, user_id=other_user.id))
        db.session.commit()
        join_room(f"chat_{chat.id}")
        return {"ok": True, "chat": _serialize_chat_summary(chat, current_user)}

    name = (data.get("name") or "").strip()
    if not name:
        return {"ok": False, "error": "Group name is required"}
    invitees = _resolve_invitees(
        data.get("invitees"),
        data.get("usernames"),
        data.get("members"),
        data.get("user_ids"),
    )
    chat = Chat(name=name, is_group=True, creator_id=current_user.id)
    db.session.add(chat)
    try:
        db.session.flush()
        db.session.add(ChatMember(chat_id=chat.id, user_id=current_user.id, is_admin=True))
        created_invites: List[GroupInvite] = []
        for invitee in invitees:
            if invitee.id == current_user.id:
                continue
            if chat.has_member(invitee.id):
                continue
            existing_invite = GroupInvite.query.filter_by(
                chat_id=chat.id, invitee_id=invitee.id, status="pending"
            ).first()
            if existing_invite:
                continue
            invitation = GroupInvite(
                chat_id=chat.id,
                inviter_id=current_user.id,
                invitee_id=invitee.id,
            )
            db.session.add(invitation)
            created_invites.append(invitation)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to create group chat.")
        return {"ok": False, "error": "Failed to create group."}
    join_room(f"chat_{chat.id}")
    summary = _serialize_chat_summary(chat, current_user)
    _broadcast_contacts(current_user)
    for invitation in created_invites:
        if invitation.invitee:
            _broadcast_contacts(invitation.invitee)
    return {
        "ok": True,
        "chat": summary,
        "invites": [_serialize_group_invite(invite) for invite in created_invites],
    }


@socketio.on("group:invite")
def handle_group_invite(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    chat_id = data.get("chat_id")
    if not chat_id:
        return {"ok": False, "error": "Chat ID required"}
    chat = Chat.query.get(chat_id)
    if not chat or not chat.is_group:
        return {"ok": False, "error": "Group chat not found"}
    membership = chat.members.filter_by(user_id=current_user.id).first()
    if not membership or not membership.is_admin:
        return {"ok": False, "error": "Only group admins can invite members."}
    invitees = _resolve_invitees(
        data.get("invitees"),
        data.get("usernames"),
        data.get("members"),
        data.get("user_ids"),
    )
    if not invitees:
        return {"ok": False, "error": "No invitees specified."}
    created_invites: List[GroupInvite] = []
    try:
        for invitee in invitees:
            if invitee.id == current_user.id:
                continue
            if chat.has_member(invitee.id):
                continue
            existing_invite = GroupInvite.query.filter_by(
                chat_id=chat.id, invitee_id=invitee.id, status="pending"
            ).first()
            if existing_invite:
                continue
            invitation = GroupInvite(
                chat_id=chat.id,
                inviter_id=current_user.id,
                invitee_id=invitee.id,
            )
            db.session.add(invitation)
            created_invites.append(invitation)
        if not created_invites:
            db.session.rollback()
            return {"ok": False, "error": "No new invitations were created."}
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to invite group members.")
        return {"ok": False, "error": "Unable to send invites."}
    _broadcast_contacts(current_user)
    for invitation in created_invites:
        if invitation.invitee:
            _broadcast_contacts(invitation.invitee)
    return {
        "ok": True,
        "chat_id": chat.id,
        "invites": [_serialize_group_invite(invite) for invite in created_invites],
    }


@socketio.on("group:respond")
def handle_group_respond(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    invite_id = data.get("invite_id")
    action = (data.get("action") or "").strip().lower()
    if not invite_id or action not in {"accept", "decline"}:
        return {"ok": False, "error": "Invalid invitation response."}
    invite = GroupInvite.query.filter_by(id=invite_id, invitee_id=current_user.id).first()
    if not invite or invite.status != "pending":
        return {"ok": False, "error": "Invitation not found."}
    chat = invite.group or (Chat.query.get(invite.chat_id) if invite.chat_id else None)
    if not chat:
        return {"ok": False, "error": "Group chat missing."}
    if action == "accept":
        try:
            if not chat.has_member(current_user.id):
                db.session.add(ChatMember(chat_id=chat.id, user_id=current_user.id))
            invite.status = "accepted"
            invite.responded_at = datetime.utcnow()
            db.session.commit()
        except Exception:
            db.session.rollback()
            current_app.logger.exception("Failed to accept group invite.")
            return {"ok": False, "error": "Unable to join group."}
        join_room(f"chat_{chat.id}")
        summary = _serialize_chat_summary(chat, current_user)
        _broadcast_contacts(current_user)
        if invite.inviter:
            _broadcast_contacts(invite.inviter)
        socketio.emit(
            "chat:member_update",
            {
                "chat_id": chat.id,
                "members": [
                    _serialize_member(member)
                    for member in chat.members.order_by(ChatMember.joined_at.asc())
                ],
            },
            room=f"chat_{chat.id}",
        )
        _emit_chat_history(chat, current_user)
        return {"ok": True, "status": "accepted", "chat": summary}
    try:
        invite.status = "declined"
        invite.responded_at = datetime.utcnow()
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to decline group invite.")
        return {"ok": False, "error": "Unable to decline invite."}
    _broadcast_contacts(current_user)
    if invite.inviter:
        _broadcast_contacts(invite.inviter)
    return {"ok": True, "status": "declined"}


@socketio.on("contacts:search")
def handle_contacts_search(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    query = (data.get("query") or "").strip().lstrip("@")
    if not query:
        return {"ok": True, "results": []}
    results = (
        User.query.filter(
            or_(User.username.ilike(f"%{query}%"), User.display_name.ilike(f"%{query}%"))
        )
        .filter(User.id != current_user.id)
        .limit(10)
        .all()
    )
    return {"ok": True, "results": [user.to_public_dict() for user in results]}


@socketio.on("friend:send_request")
def handle_friend_request(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    target_id = data.get("user_id")
    username_input = (data.get("username") or "").strip().lower().lstrip("@")
    user: Optional[User] = None
    if target_id:
        user = User.query.get(target_id)
    elif username_input:
        user = (
            User.query.filter(
                func.lower(User.username).in_([username_input, f"@{username_input}"])
            ).first()
        )
    if not user:
        return {"ok": False, "error": "User not found"}
    if user.id == current_user.id:
        return {"ok": False, "error": "You cannot add yourself."}
    if BlockedUser.query.filter_by(user_id=user.id, blocked_user_id=current_user.id).first():
        return {"ok": False, "error": "You cannot send a request to this user."}
    if Friendship.query.filter_by(user_id=current_user.id, friend_id=user.id).first():
        return {"ok": False, "error": "You are already friends."}
    existing_request = FriendRequest.query.filter_by(
        sender_id=current_user.id, receiver_id=user.id, status="pending"
    ).first()
    if existing_request:
        return {"ok": False, "error": "Request already sent."}
    reverse_request = FriendRequest.query.filter_by(
        sender_id=user.id, receiver_id=current_user.id, status="pending"
    ).first()
    if reverse_request:
        return {"ok": False, "error": "This user has already sent you a request."}
    friend_request = FriendRequest(sender_id=current_user.id, receiver_id=user.id)
    db.session.add(friend_request)
    db.session.commit()
    receiver_pending = FriendRequest.query.filter_by(receiver_id=user.id, status="pending").count()
    socketio.emit(
        "friend:update",
        {
            "action": "request_received",
            "from_user": current_user.to_public_dict(),
            "pending_count": receiver_pending,
        },
        room=f"user_{user.id}",
    )
    receiver_user = User.query.get(user.id)
    if receiver_user:
        _broadcast_contacts(receiver_user)
    _broadcast_contacts(current_user)
    return {"ok": True, "request": {"id": friend_request.id, "user": user.to_public_dict()}}


@socketio.on("friend:respond")
def handle_friend_respond(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    request_id = data.get("request_id")
    action = data.get("action")
    friend_request = FriendRequest.query.get(request_id)
    if not friend_request or friend_request.receiver_id != current_user.id:
        return {"ok": False, "error": "Friend request not found"}
    sender_user = friend_request.sender
    if action == "accept":
        db.session.add(Friendship(user_id=current_user.id, friend_id=sender_user.id))
        db.session.add(Friendship(user_id=sender_user.id, friend_id=current_user.id))
        db.session.delete(friend_request)
        db.session.commit()
        socketio.emit(
            "friend:update",
            {"action": "request_accepted", "from_user": current_user.to_public_dict()},
            room=f"user_{sender_user.id}",
        )
        _broadcast_contacts(current_user)
        other_user = User.query.get(sender_user.id)
        if other_user:
            _broadcast_contacts(other_user)
        return {"ok": True, "status": "accepted"}
    if action == "decline":
        db.session.delete(friend_request)
        db.session.commit()
        socketio.emit(
            "friend:update",
            {"action": "request_declined", "from_user": current_user.to_public_dict()},
            room=f"user_{sender_user.id}",
        )
        _broadcast_contacts(current_user)
        other_user = User.query.get(sender_user.id)
        if other_user:
            _broadcast_contacts(other_user)
        return {"ok": True, "status": "declined"}
    return {"ok": False, "error": "Unsupported action"}


@socketio.on("friend:cancel")
def handle_friend_cancel(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    request_id = data.get("request_id")
    if not request_id:
        return {"ok": False, "error": "Invalid request"}
    friend_request = FriendRequest.query.filter_by(
        id=request_id, sender_id=current_user.id, status="pending"
    ).first()
    if not friend_request:
        return {"ok": False, "error": "Pending request not found"}
    receiver = friend_request.receiver
    db.session.delete(friend_request)
    db.session.commit()
    socketio.emit(
        "friend:update",
        {
            "action": "request_cancelled",
            "from_user": current_user.to_public_dict(),
            "pending_count": FriendRequest.query.filter_by(receiver_id=receiver.id, status="pending").count(),
        },
        room=f"user_{receiver.id}",
    )
    _broadcast_contacts(current_user)
    other_user = User.query.get(receiver.id)
    if other_user:
        _broadcast_contacts(other_user)
    return {"ok": True}


@socketio.on("friend:remove")
def handle_friend_remove(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    friend_id = data.get("friend_id")
    if not friend_id:
        return {"ok": False, "error": "Invalid friend selection"}
    friend = User.query.get(friend_id)
    if not friend:
        return {"ok": False, "error": "User not found"}
    relationships = Friendship.query.filter(
        or_(
            and_(Friendship.user_id == current_user.id, Friendship.friend_id == friend.id),
            and_(Friendship.user_id == friend.id, Friendship.friend_id == current_user.id),
        )
    ).all()
    if not relationships:
        return {"ok": False, "error": "You are not friends yet."}
    for relation in relationships:
        db.session.delete(relation)
    FriendRequest.query.filter(
        or_(
            and_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == friend.id),
            and_(FriendRequest.sender_id == friend.id, FriendRequest.receiver_id == current_user.id),
        )
    ).delete(synchronize_session=False)
    db.session.commit()
    socketio.emit(
        "friend:update",
        {"action": "friend_removed", "from_user": current_user.to_public_dict()},
        room=f"user_{friend.id}",
    )
    other_user = User.query.get(friend.id)
    if other_user:
        _broadcast_contacts(other_user)
    _broadcast_contacts(current_user)
    return {"ok": True}


@socketio.on("me:update")
def handle_me_update(data):
    if not current_user.is_authenticated:
        return {"ok": False, "error": "Unauthorized"}
    display_name = (data.get("display_name") or "").strip()
    bio = (data.get("bio") or "").strip()
    avatar_payload = data.get("avatar")
    timezone_mode = _sanitize_timezone_mode(data.get("timezone_mode"))
    timezone_offset = _sanitize_timezone_offset(data.get("timezone_offset"))
    datetime_format = _sanitize_datetime_format(data.get("datetime_format"))
    if not display_name:
        return {"ok": False, "error": "Display name is required."}
    current_user.display_name = display_name
    current_user.bio = bio
    current_user.timezone_mode = timezone_mode
    current_user.timezone_offset = timezone_offset
    current_user.datetime_format = datetime_format

    if avatar_payload:
        if avatar_payload.get("remove"):
            if current_user.avatar:
                remove_file("avatars", current_user.avatar.filename)
                existing_avatar = current_user.avatar
                current_user.avatar = None
                db.session.delete(existing_avatar)
        else:
            existing_filename = current_user.avatar.filename if current_user.avatar else None
            try:
                filename = _persist_avatar(avatar_payload, existing_filename=existing_filename)
            except ValueError as exc:
                db.session.rollback()
                return {"ok": False, "error": str(exc)}
            except Exception:  # pragma: no cover - safeguard
                db.session.rollback()
                current_app.logger.exception("Failed to persist avatar data.")
                return {"ok": False, "error": "Failed to update avatar."}
            if current_user.avatar:
                current_user.avatar.created_at = datetime.utcnow()
            else:
                avatar = Avatar(filename=filename)
                db.session.add(avatar)
                db.session.flush()
                current_user.avatar = avatar
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Profile update failed.")
        return {"ok": False, "error": "Failed to update profile."}
    user_payload = current_user.to_public_dict()
    user_payload["email"] = current_user.email
    user_payload["settings"] = current_user.settings_payload()
    socketio.emit("profile:update", {"user": user_payload}, room=f"user_{current_user.id}")
    return {"ok": True, "user": user_payload}
