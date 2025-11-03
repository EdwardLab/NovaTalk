import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

from app import create_app, db
from app.models.user import User
from sqlalchemy import func


app = create_app()

def create_user(username, email, password, display_name=None):
    username = username.strip().lower().lstrip("@")
    email = email.strip().lower()
    if not display_name:
        display_name = username
    with app.app_context():
        if User.query.filter(func.lower(User.username).in_([username, f"@{username}"])).first():
            print(f"sername '{username}' already exists, skipping.")
            return
        if User.query.filter(func.lower(User.email) == email).first():
            print(f"Email '{email}' already registered, skipping.")
            return
        
        user = User(username=username, email=email, display_name=display_name, bio="")
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        print(f"User '{username}' created successfully!")


if __name__ == "__main__":
    users = [
        ("testuser1", "testuser1@example.com", "testuser123@", "Test User 1"),
        ("testuser2", "testuser2@example.com", "testuser123@", "Test User 2"),
    ]
    for u in users:
        create_user(*u)
