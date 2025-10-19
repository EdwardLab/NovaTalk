from datetime import datetime

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user
from sqlalchemy import func

from app import db, socketio
from app.auth.forms import LoginForm, ProfileForm, RegistrationForm
from app.models import Avatar, FriendRequest, Friendship, User
from app.utils.storage import save_avatar

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("chat.inbox"))

    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(
            display_name=form.display_name.data,
            username=form.username.data,
            email=form.email.data,
            bio=form.bio.data or "",
        )
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        flash("Account created. Please sign in.", "success")
        return redirect(url_for("auth.login"))
    return render_template("auth/register.html", form=form)


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("chat.inbox"))

    form = LoginForm()
    if form.validate_on_submit():
        identifier = (form.username.data or "").strip()
        lookup_value = identifier.lower()
        user = None

        if "@" in identifier and not identifier.startswith("@"):
            user = User.query.filter(func.lower(User.email) == lookup_value).first()
        else:
            normalized_username = lookup_value.lstrip("@")
            user = User.query.filter(
                func.lower(User.username).in_([normalized_username, f"@{normalized_username}"])
            ).first()

        if not user or not user.check_password(form.password.data):
            flash("Invalid username or password", "danger")
            return render_template("auth/login.html", form=form)

        login_user(user)
        user.online = True
        user.last_seen = datetime.utcnow()
        db.session.commit()
        flash("Welcome back!", "success")
        next_page = request.args.get("next")
        return redirect(next_page or url_for("chat.inbox"))
    return render_template("auth/login.html", form=form)


@auth_bp.route("/logout")
@login_required
def logout():
    current_user.set_offline()
    logout_user()
    flash("You have been signed out.", "info")
    return redirect(url_for("auth.login"))


@auth_bp.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    current_username = (current_user.username or "").lstrip("@")
    form = ProfileForm(
        original_username=current_username,
        original_email=current_user.email,
        display_name=current_user.display_name,
        username=current_username,
        email=current_user.email,
        bio=current_user.bio,
    )

    if form.validate_on_submit():
        current_user.display_name = form.display_name.data
        current_user.username = form.username.data
        current_user.email = form.email.data
        current_user.bio = form.bio.data or ""

        avatar_file = request.files.get("avatar")
        if avatar_file and avatar_file.filename:
            try:
                existing = current_user.avatar.filename if current_user.avatar else None
                filename = save_avatar(avatar_file, existing_filename=existing)
            except ValueError as exc:
                flash(str(exc), "danger")
                return render_template("auth/profile.html", form=form)

            if current_user.avatar:
                current_user.avatar.created_at = datetime.utcnow()
            else:
                avatar = Avatar(filename=filename)
                db.session.add(avatar)
                db.session.flush()
                current_user.avatar = avatar

        db.session.commit()
        if current_user.avatar_url:
            socketio.emit(
                "profile:avatar-updated",
                {
                    "user_id": current_user.id,
                    "avatar_url": current_user.avatar_url,
                },
                room=f"user_{current_user.id}",
            )
        flash("Profile updated", "success")
        return redirect(url_for("auth.profile"))
    return render_template("auth/profile.html", form=form)


@auth_bp.route("/profile/<username>")
@login_required
def public_profile(username):
    normalized = (username or "").strip().lower().lstrip("@")
    profile_user = User.query.filter(
        func.lower(User.username).in_([normalized, f"@{normalized}"])
    ).first_or_404()
    is_self = profile_user.id == current_user.id
    friend_status = "self" if is_self else "none"
    incoming_request = None
    outgoing_request = None
    if not is_self:
        is_friend = bool(
            Friendship.query.filter_by(user_id=current_user.id, friend_id=profile_user.id).first()
            and Friendship.query.filter_by(user_id=profile_user.id, friend_id=current_user.id).first()
        )
        if is_friend:
            friend_status = "friends"
        else:
            incoming_request = FriendRequest.query.filter_by(
                sender_id=profile_user.id, receiver_id=current_user.id, status="pending"
            ).first()
            outgoing_request = FriendRequest.query.filter_by(
                sender_id=current_user.id, receiver_id=profile_user.id, status="pending"
            ).first()
            if incoming_request:
                friend_status = "incoming"
            elif outgoing_request:
                friend_status = "outgoing"
            else:
                friend_status = "none"
    return render_template(
        "auth/public_profile.html",
        profile_user=profile_user,
        friend_status=friend_status,
        incoming_request=incoming_request,
        outgoing_request=outgoing_request,
    )
