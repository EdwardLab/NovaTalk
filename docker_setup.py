"""
docker_setup.py
---------------
Automatic admin account creation for Docker deployments.
Reads database connection and admin credentials from environment variables.
Automatically fixes MySQL authentication if needed.
"""

import os
import time
import pymysql
from sqlalchemy import text
from app import create_app, db
from app.models import User


def fix_mysql_auth():
    host = os.getenv("MYSQL_HOST", "db")
    user = os.getenv("MYSQL_USER", "novatalk")
    password = os.getenv("MYSQL_PASSWORD", "novatalk")
    root_pw = os.getenv("MYSQL_ROOT_PASSWORD", "root")

    try:
        conn = pymysql.connect(host=host, user=user, password=password, database="novatalk")
        conn.close()
        print("[*] MySQL authentication works, no fix needed.")
        return
    except Exception as e:
        print(f"[*] MySQL login failed for '{user}', attempting to fix authentication ({type(e).__name__}: {e})")

    try:
        root_conn = pymysql.connect(host=host, user="root", password=root_pw)
        with root_conn.cursor() as cur:
            cur.execute("ALTER USER 'novatalk'@'%' IDENTIFIED WITH mysql_native_password BY 'novatalk';")
            cur.execute("ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'root';")
            cur.execute("FLUSH PRIVILEGES;")
        root_conn.commit()
        root_conn.close()
        print("[*] MySQL authentication method fixed to mysql_native_password.")
    except Exception as e2:
        print(f"[*] Failed to apply MySQL auth fix ({type(e2).__name__}: {e2})")


def main():
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    admin_display = os.getenv("ADMIN_DISPLAY_NAME", "Administrator")

    print("[*] Initializing NovaTalk (Docker setup mode)")
    print(f"Admin: {admin_username} <{admin_email}>")

    fix_mysql_auth()  # auto-detect and fix MySQL auth before proceeding

    app = create_app()

    print("[*] Waiting for database connection...")
    for i in range(60):
        try:
            with app.app_context():
                db.session.execute(text("SELECT 1"))
            print("[*] Database reachable!")
            break
        except Exception as e:
            print(f"  Attempt {i+1}/60: waiting... ({type(e).__name__}: {e})")
            time.sleep(2)
    else:
        print("[*] Database not reachable after 120s, aborting setup.")
        return

    with app.app_context():
        db.create_all()
        print("[*] Tables created or verified.")

        existing = User.query.filter_by(username=admin_username.lower()).first()
        if existing:
            print("[*] Admin already exists, skipping creation.")
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

        print(f"[*] Admin user created: {admin_username} ({admin_email})")


if __name__ == "__main__":
    main()
