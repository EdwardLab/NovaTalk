from __future__ import annotations

from flask_wtf import FlaskForm
from wtforms import PasswordField, StringField, SubmitField, TextAreaField
from wtforms.validators import DataRequired, Email, EqualTo, Length, ValidationError
from sqlalchemy import func

from app.models import User


def username_validator(_, field):
    value = (field.data or "").strip()
    if value.startswith("@"):
        value = value[1:]
    if not value:
        raise ValidationError("Username is required.")
    if " " in value:
        raise ValidationError("Username cannot contain spaces.")
    field.data = value


class RegistrationForm(FlaskForm):
    display_name = StringField("Display name", validators=[DataRequired(), Length(max=120)])
    username = StringField("Username", validators=[DataRequired(), Length(max=80), username_validator])
    email = StringField("Email", validators=[DataRequired(), Email(), Length(max=255)])
    bio = TextAreaField("Bio", validators=[Length(max=500)])
    password = PasswordField("Password", validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField("Confirm password", validators=[DataRequired(), EqualTo("password")])
    submit = SubmitField("Create account")

    def validate_username(self, field):
        username = (field.data or "").strip().lower().lstrip("@")
        if not username:
            raise ValidationError("Username is required.")
        existing = User.query.filter(func.lower(User.username).in_([username, f"@{username}"])).first()
        if existing:
            raise ValidationError("Username already taken.")
        field.data = username

    def validate_email(self, field):
        email = (field.data or "").strip().lower()
        existing = User.query.filter(func.lower(User.email) == email).first()
        if existing:
            raise ValidationError("Email already registered.")
        field.data = email


class LoginForm(FlaskForm):
    username = StringField("Username or email", validators=[DataRequired()])
    password = PasswordField("Password", validators=[DataRequired()])
    submit = SubmitField("Sign in")

    def validate_username(self, field):
        field.data = (field.data or "").strip()


class ProfileForm(FlaskForm):
    display_name = StringField("Display name", validators=[DataRequired(), Length(max=120)])
    username = StringField("Username", validators=[DataRequired(), Length(max=80), username_validator])
    email = StringField("Email", validators=[DataRequired(), Email(), Length(max=255)])
    bio = TextAreaField("Bio", validators=[Length(max=500)])
    submit = SubmitField("Save changes")

    def __init__(self, original_username: str, original_email: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        cleaned_username = (original_username or "").strip().lower().lstrip("@")
        self.original_username = cleaned_username
        self.original_username_lower = cleaned_username
        self.original_email = original_email
        self.original_email_lower = (original_email or "").lower()

    def validate_username(self, field):
        username = (field.data or "").strip().lower().lstrip("@")
        if not username:
            raise ValidationError("Username is required.")
        if username != self.original_username_lower:
            existing = User.query.filter(func.lower(User.username).in_([username, f"@{username}"])).first()
            if existing and existing.username.lower().lstrip("@") != self.original_username_lower:
                raise ValidationError("Username already taken.")
        field.data = username

    def validate_email(self, field):
        email = (field.data or "").strip().lower()
        if email != self.original_email_lower:
            existing = User.query.filter(func.lower(User.email) == email).first()
            if existing and existing.email.lower() != self.original_email_lower:
                raise ValidationError("Email already registered.")
        field.data = email
