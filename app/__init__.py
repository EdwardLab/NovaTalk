import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_socketio import SocketIO
from flask_wtf.csrf import CSRFProtect
from dotenv import load_dotenv

# Global extension objects; initialized in create_app

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
socketio = SocketIO(cors_allowed_origins="*")
csrf = CSRFProtect()


def create_app(config_object=None):
    """Application factory for NovaTalk."""
    load_dotenv()

    app = Flask(__name__, instance_relative_config=False)

    database_url = os.environ.get("DATABASE_URL", "mysql+pymysql://user:password@localhost/novatalk")
    if database_url.startswith("sqlite:///"):
        raw_path = database_url.replace("sqlite:///", "", 1)
        if raw_path and raw_path != ":memory__":
            project_root = os.path.dirname(app.root_path)
            if not os.path.isabs(raw_path):
                raw_path = os.path.abspath(os.path.join(project_root, raw_path))
            raw_dir = os.path.dirname(raw_path)
            if raw_dir and not os.path.exists(raw_dir):
                os.makedirs(raw_dir, exist_ok=True)
            database_url = f"sqlite:///{raw_path}"

    upload_folder = os.environ.get("UPLOAD_FOLDER", os.path.join(app.root_path, "static", "uploads"))
    max_upload_env = os.environ.get("MAX_UPLOAD_MB", "30")
    try:
        max_upload_mb = max(1, int(max_upload_env))
    except (TypeError, ValueError):
        max_upload_mb = 30

    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-key"),
        SQLALCHEMY_DATABASE_URI=database_url,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        UPLOAD_FOLDER=upload_folder,
        MAX_CONTENT_LENGTH=max_upload_mb * 1024 * 1024,
        MAX_UPLOAD_MB=max_upload_mb,
        SESSION_COOKIE_SECURE=False,
    )

    if config_object:
        app.config.from_object(config_object)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)

    # SocketIO needs the secret key configured first
    socketio.init_app(app, cors_allowed_origins="*")

    from .models import user, chat, friendship, message  # noqa: F401

    from .auth.routes import auth_bp
    from .chat.routes import chat_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(chat_bp)

    login_manager.login_view = "auth.login"

    @login_manager.user_loader
    def load_user(user_id):
        return user.User.query.get(int(user_id))

    # ensure upload directories exist
    os.makedirs(os.path.join(app.config["UPLOAD_FOLDER"], "avatars"), exist_ok=True)
    os.makedirs(os.path.join(app.config["UPLOAD_FOLDER"], "messages"), exist_ok=True)

    return app
