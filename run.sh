#!/usr/bin/env bash
# Build the frontend and backend, then start the site on http://localhost:8080
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building frontend (React + TypeScript)"
(cd frontend && { [ -d node_modules ] || npm install; } && npm run build)

echo "==> Building backend (Java)"
(cd backend && mkdir -p out && javac -d out src/main/java/garage/*.java)

echo "==> Starting server"
cd backend
exec java -cp out garage.Main
