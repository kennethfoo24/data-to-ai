# Load .env if it exists
ifneq (,$(wildcard .env))
  include .env
  export
endif

.PHONY: up up-full down seed logs ps build clean setup help

## Start core services (~8GB RAM)
up:
	docker compose --profile $${COMPOSE_PROFILES:-core} up -d

## Start full profile (Airbyte, MinIO, pgAdmin) (~16GB RAM)
up-full:
	COMPOSE_PROFILES=full docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full up -d

## Stop all services
down:
	docker compose --profile core down
	docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full down 2>/dev/null || true

## Generate and load seed data
seed:
	python3 seed/generate_data.py
	bash seed/seed.sh

## Tail logs
logs:
	docker compose --profile $${COMPOSE_PROFILES:-core} logs -f

## Show running containers
ps:
	docker compose --profile $${COMPOSE_PROFILES:-core} ps

## Build custom Docker images
build:
	docker compose --profile core build

## Remove containers, volumes, and generated seed data
clean:
	docker compose --profile core down -v
	rm -rf seed/data/

## One-shot setup (copies .env, builds images, starts, seeds)
setup:
	bash scripts/setup.sh

## Show this help
help:
	@grep -E '^## |^[a-zA-Z_-]+:' Makefile | \
	  awk '/^## /{desc=$$0; next} /^[a-zA-Z_-]+:/{gsub(/:$$/,"",$$1); printf "  %-12s %s\n", $$1, substr(desc,4)}'
