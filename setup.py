"""Interactive setup utility for NovaTalk.

This script guides a system administrator through configuring NovaTalk
for the first time. It creates a .env file, initialises the database,
and provisions the first administrator account.
"""
import getpass
import os
import secrets
from pathlib import Path

from dotenv import set_key

from app import create_app, db
from app.models import User


ENV_PATH = Path(".env")


def prompt(prompt_text, default=None, secret=False):
    prompt_display = f"{prompt_text}"
    if default:
        prompt_display += f" [{default}]"
    prompt_display += ": "

    if secret:
        value = getpass.getpass(prompt_display)
    else:
        value = input(prompt_display)

    if not value and default is not None:
        return default
    return value


def generate_env(database_url: str, upload_folder: str, max_upload_mb: int):
    secret_key = secrets.token_hex(16)
    set_key(str(ENV_PATH), "SECRET_KEY", secret_key)
    set_key(str(ENV_PATH), "DATABASE_URL", database_url)
    set_key(str(ENV_PATH), "UPLOAD_FOLDER", upload_folder)
    set_key(str(ENV_PATH), "MAX_UPLOAD_MB", str(max_upload_mb))
    print("[+] .env file generated.")


def initialise_database(app):
    with app.app_context():
        db.create_all()
        print("[+] Database tables created.")

        existing_admin = User.query.filter_by(is_admin=True).first()
        if existing_admin:
            print("[!] Admin account already exists, skipping admin creation.")
            return

        print("\nCreate the first administrator account")
        display_name = prompt("Display name", "Administrator")
        username = prompt("Username", "admin")
        email = prompt("Email address", "admin@example.com")
        password = getpass.getpass("Password: ")

        admin = User(
            display_name=display_name,
            username=username.strip().lower().lstrip("@"),
            email=email.lower(),
            is_admin=True,
        )
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        print("[+] Admin user created.")



def main():
    print("NovaTalk setup wizard\n=====================")
    print("Provide your MySQL database connection details. The database must already exist.")

    mysql_host = prompt("MySQL host", "localhost")
    mysql_port = prompt("MySQL port", "3306")
    mysql_db = prompt("Database name", "novatalk")
    mysql_user = prompt("Database user", "novatalk")
    mysql_password = prompt("Database password", secret=True)

    database_url = f"mysql+pymysql://{mysql_user}:{mysql_password}@{mysql_host}:{mysql_port}/{mysql_db}"
    upload_folder = prompt("Upload directory", str(Path("app/static/uploads").resolve()))
    max_upload_input = prompt("Maximum upload size (MB)", "30")
    try:
        max_upload_mb = max(1, int(max_upload_input))
    except ValueError:
        print("[!] Invalid size provided. Using default 30 MB.")
        max_upload_mb = 30

    if not ENV_PATH.exists():
        ENV_PATH.touch()

    generate_env(database_url, upload_folder, max_upload_mb)

    app = create_app()
    initialise_database(app)

    print("\nSetup complete! You can now run NovaTalk with 'python app.py'.")


if __name__ == "__main__":
    main()
