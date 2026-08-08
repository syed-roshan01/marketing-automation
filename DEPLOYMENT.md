# Zyqora — Docker deployment (single-user, personal hosting)

This document describes a simple way to host a single-instance Zyqora online using Docker.

Prerequisites
- Docker & Docker Compose installed on your host (Linux server or cloud VM).

Build & run (local testing)

1. From the repo root build and start the stack:

```bash
docker compose up --build -d
```

2. The app will be available on `http://<HOST>:3000`.

Notes
- Data is persisted by mounting the repo `./data` folder into the container at `/app/data`.
- Environment variables:
  - `PORT` — server port (default `3000`).
  - `ZYQORA_DATA` — data directory inside container (set by `docker-compose` to `/app/data`).
  - `CLOUDFLARED_BIN` — optional path to `cloudflared` binary when using the tunnel feature.

Security & exposure
- This setup intentionally keeps things minimal for single-user personal hosting. If you expose the app to the public internet, add a reverse proxy (nginx, Traefik) and enable TLS (Let's Encrypt). Consider firewall rules to limit access.

Optional: Deploy to a cloud provider
- On a single VM (DigitalOcean/Hetzner), install Docker and run the `docker compose` command above.
- For container platforms (Render, Railway), create a single service using the Dockerfile. Map port `3000` and attach a persistent disk for `/app/data`.

What I changed
- Added `Dockerfile`, `docker-compose.yml`, `.dockerignore`, and this `DEPLOYMENT.md`.
