"""
docker_setup.py
---------------
Automatic admin account creation for Docker deployments.
Reads database connection and admin credentials from environment variables.
"""

import os
import time
from app import create_app, db
from app.models import User

def main():
    # Pull credentials from environment variables
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    admin_display = os.getenv("ADMIN_DISPLAY_NAME", "Administrator")

    print("🔧 Initializing NovaTalk (Docker setup mode)")
    print(f"Admin: {admin_username} <{admin_email}>")

    app = create_app()

    # Wait for DB to become available
    for i in range(30):
        try:
            with app.app_context():
                db.session.execute("SELECT 1")
            break
        except Exception as e:
            print(f"Waiting for database... ({e})")
            time.sleep(2)
    else:
        print("Database not reachable after 60s.")
        return

    with app.app_context():
        db.create_all()

        existing = User.query.filter_by(username=admin_username).first()
        if existing:
            print("Admin already exists, skipping creation.")
            return

        admin = User(
            display_name=admin_display,
            username=admin_username.lower(),
            email=admin_email.lower(),
            is_admin=True,
        )
        admin.set_password(admin_password)
        db.session.add(admin)
        db.session.commit()

        print(f"Admin user created: {admin_username}")


if __name__ == "__main__":
    main()
