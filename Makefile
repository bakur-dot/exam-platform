# ISO 17024 Exam Platform — management shortcuts
# Requires: make, Node.js ≥ 20, npm, Docker Desktop (for docker-* targets)
# Windows users: run the equivalent `npm run <script>` commands from package.json.

.PHONY: install dev seed docker-up docker-down db-migrate db-studio test-e2e

## install  — install all dependencies (backend + frontend)
install:
	npm install
	npm install --prefix frontend

## dev      — run backend and frontend concurrently in development mode
dev:
	npm run dev

## seed     — seed the database with default roles and SuperAdmin account
seed:
	npm run seed

## docker-up  — build images and start the full Docker Compose stack
docker-up:
	docker-compose up --build

## docker-down — stop and remove containers (data volumes are preserved)
docker-down:
	docker-compose down

## db-migrate — run pending Prisma migrations (dev mode, creates migration files)
db-migrate:
	npx prisma migrate dev

## db-studio  — open Prisma Studio in the browser
db-studio:
	npx prisma studio

## test-e2e   — run Playwright E2E tests (backend must already be running)
test-e2e:
	npm run test:e2e

help:
	@grep -E '^##' Makefile | sed 's/^## /  /'
