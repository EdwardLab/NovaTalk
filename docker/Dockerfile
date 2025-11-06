# syntax=docker/dockerfile:1
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /
RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential default-libmysqlclient-dev pkg-config \
    libjpeg-dev zlib1g-dev && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/EdwardLab/NovaTalk.git /app
WORKDIR /app
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir gunicorn eventlet pymysql
WORKDIR /
RUN mkdir -p /uploads
ENV UPLOAD_FOLDER=/uploads
ENV SECRET_KEY=changeme
ENV DATABASE_URL=${DATABASE_URL}
ENV FLASK_APP=app:create_app
EXPOSE 5000
CMD ["bash", "-c", "python /app/docker_setup.py && cd /app && exec gunicorn -k eventlet -w 1 'app:create_app()' -b 0.0.0.0:5000"]
