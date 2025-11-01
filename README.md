# NovaTalk

NovaTalk is a lightweight self-hosted chat platform built with Flask, SQLAlchemy, and Flask-SocketIO.
 It’s designed to feel familiar and modern — a clean, Material Design 3 interface, smooth animations, and a focused three-column messenger layout.

![chat.png](app/static/img/demo/chat.png)

## ✨ Features

- **Material Design 3** interface with light/dark themes that adapt smoothly
- **Real-time messaging** using Socket.IO (works for DMs and group chats)
- **Avatar uploads** with live crop preview + image attachments in chat
- **Friend system** — requests, blocking, and public profile pages
- **CSRF-safe everywhere** (forms + AJAX included)
- **Command-line admin tools** for creating and managing users directly

## 🚀 Getting Started

### Docker

(Under development)

### Production Server

#### 1. Install dependencies

```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

#### 2. Run the setup wizard

```
python setup.py
```

Provide your MySQL connection details, an uploads directory, and the credentials for the first administrator account. The wizard creates a `.env` file and initialises the database schema.

#### 3. Start Production Server

```
gunicorn -k eventlet -w 1 "app:app" -b 0.0.0.0:5000
```

The application defaults to `http://localhost:5000`.

(Only works on Linux)

### Development Server

(Works on both Windows & Linux)

#### 1. Launch Development Server

```
python app.py
```

The application defaults to `http://localhost:5000`.

## Administrative CLI

NovaTalk ships with a Click-based management tool for user administration.

Create a user:

```
python cli.py add-user --username alice --email alice@example.com --password S3cureP@ss --display-name "Alice Johnson"
```

Reset a password:

```
python cli.py set-password --username alice --password N3wSecret!
```

All commands run inside the Flask application context and persist changes via SQLAlchemy with Werkzeug-secured hashes.

For more CLI usages, please refer to [CLI Documents](docs/cli.md).

## Environment variables

- `SECRET_KEY` – Flask secret key (generated during setup)

- `DATABASE_URL` – SQLAlchemy connection string, e.g. `mysql+pymysql://user:password@localhost:3306/novatalk`

- `UPLOAD_FOLDER` – Absolute path where avatars and message images will be stored

  (Check .env file)

## Development notes

- The interface uses Material Web typography, elevation, and ripples with custom CSS tailored for NovaTalk.
- Real-time messaging uses Flask-SocketIO with eventlet. Ensure eventlet is installed and use `socketio.run` in production.
- File uploads are validated for image type and size and stored within `UPLOAD_FOLDER`.
- To create migrations, run `flask db init`, `flask db migrate`, and `flask db upgrade` after setting `FLASK_APP=app:create_app`.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

<div align="center">
  <a href="https://moonshot.hackclub.com" target="_blank">
    <img src="https://hc-cdn.hel1.your-objectstorage.com/s/v3/35ad2be8c916670f3e1ac63c1df04d76a4b337d1_moonshot.png" 
         alt="This project is part of Moonshot, a 4-day hackathon in Florida visiting Kennedy Space Center and Universal Studios!" 
         style="width: 100%;">
  </a>
</div>
