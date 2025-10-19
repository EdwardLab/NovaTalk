import secrets
from pathlib import Path
from typing import Optional

from flask import current_app
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}


def _random_filename(filename: str) -> str:
    random_hex = secrets.token_hex(8)
    name = secure_filename(Path(filename).name)
    return f"{random_hex}_{name}"


def save_avatar(file: FileStorage, existing_filename: Optional[str] = None) -> Optional[str]:
    if not file:
        return None

    extension = Path(file.filename).suffix.lower().strip(".")
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Unsupported file type for avatar.")

    filename = None
    if existing_filename:
        candidate = secure_filename(Path(existing_filename).name)
        if candidate:
            filename = candidate
    if not filename:
        filename = _random_filename(file.filename)
    upload_dir = Path(current_app.config["UPLOAD_FOLDER"]) / "avatars"
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / filename
    file.save(file_path)
    return filename


def save_message_image(file: FileStorage) -> Optional[str]:
    if not file:
        return None

    extension = Path(file.filename).suffix.lower().strip(".")
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Unsupported image type.")

    filename = _random_filename(file.filename)
    upload_dir = Path(current_app.config["UPLOAD_FOLDER"]) / "messages"
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / filename
    file.save(file_path)
    return filename


def remove_file(category: str, filename: str) -> None:
    folder = Path(current_app.config["UPLOAD_FOLDER"]) / category
    file_path = folder / filename
    if file_path.exists():
        try:
            file_path.unlink()
        except OSError:
            pass
