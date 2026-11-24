.PHONY: help dev dev-all dev-api dev-admin dev-storefront dev-mobile api admin storefront mobile setup install clean-ports db-migrate db-seed docker-up docker-down docker-logs

help:
	@echo "Available shortcut commands:"
	@echo "  make dev             - Run API (port 8003) & Web concurrently"
	@echo "  make dev-all         - Run API, Admin, & Storefront"
	@echo "  make dev-api         - Run Laravel API (port 8003)"
	@echo "  make dev-admin       - Run Admin Web / POS (port 5173)"
	@echo "  make dev-storefront  - Run Customer Storefront Web (port 5173)"
	@echo "  make dev-mobile      - Run Flutter Mobile POS"
	@echo "  make api             - Shortcut for make dev-api"
	@echo "  make admin           - Shortcut for make dev-admin"
	@echo "  make storefront      - Shortcut for make dev-storefront"
	@echo "  make mobile          - Shortcut for make dev-mobile"
	@echo "  make setup           - Setup dependencies & API environment"
	@echo "  make install         - Install all dependencies (root, frontend, backend)"
	@echo "  make clean-ports     - Kill any lingering processes on ports 5173 & 8003"
	@echo "  make db-migrate      - Run Database Migrations"
	@echo "  make db-seed         - Seed Database"
	@echo "  make docker-up       - Start Docker Containers"
	@echo "  make docker-down     - Stop Docker Containers"
	@echo "  make docker-logs     - View Docker Container Logs"

dev:
	npm run dev

dev-all:
	npm run dev:all

dev-api:
	npm run dev:api

api:
	npm run dev:api

dev-admin:
	npm run dev:admin

admin:
	npm run dev:admin

dev-storefront:
	npm run dev:storefront

storefront:
	npm run dev:storefront

dev-mobile:
	npm run dev:mobile

mobile:
	npm run dev:mobile

setup:
	npm run setup

install:
	npm install
	cd frontend && npm install
	cd backend && composer install

clean-ports:
	@echo "Freeing ports 5173 and 8003..."
	@lsof -ti:5173,8003 | xargs kill -9 2>/dev/null || true
	@echo "Ports 5173 and 8003 are now free."

db-migrate:
	npm run db:migrate

db-seed:
	npm run db:seed

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f
