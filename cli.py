"""(need implemented) This Administrative command line interface for NovaTalk"""

from __future__ import annotations

import click
from sqlalchemy import func

from app import create_app, db
from app.models.user import User

app = create_app()


@click.group()
def cli():
    """Utilities for managing NovaTalk users."""


@cli.command("add-user")
@click.option("--username", required=True, help="Username (e.g. jdoe)")
@click.option("--email", required=True, help="Email address")
@click.option("--password", required=True, help="Password for the new account")
@click.option("--display-name", required=False, help="Display name to show in chats")
def add_user(username: str, email: str, password: str, display_name: str | None):
    """Create a new NovaTalk user."""
    username = username.strip().lower().lstrip("@")
    email = email.strip().lower()
    if not display_name:
        display_name = username
    with app.app_context():
        if User.query.filter(func.lower(User.username).in_([username, f"@{username}"])).first():
            raise click.ClickException(f"Username '{username}' already exists")
        if User.query.filter(func.lower(User.email) == email).first():
            raise click.ClickException(f"Email '{email}' is already registered")
        user = User(username=username, email=email, display_name=display_name, bio="")
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        click.secho(f"User '{username}' created successfully", fg="green")


@cli.command("set-password")
@click.option("--username", required=True, help="Existing username")
@click.option("--password", required=True, help="New password")
def set_password(username: str, password: str):
    """Update a user's password."""
    username = username.strip().lower().lstrip("@")
    with app.app_context():
        user = User.query.filter(func.lower(User.username).in_([username, f"@{username}"])).first()
        if not user:
            raise click.ClickException(f"User '{username}' was not found")
        user.set_password(password)
        db.session.commit()
        click.secho(f"Password updated for '{username}'", fg="green")


if __name__ == "__main__":
    cli()
