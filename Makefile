COMPOSE = docker compose -f infra/docker-compose.yml --env-file .env

.PHONY: help up down logs ps seed test lint reset check-env

help: ## Show the available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-8s %s\n", $$1, $$2}'

check-env:
	@test -f .env || (echo "Missing .env file. Run:  cp .env.example .env" && exit 1)

up: check-env ## Build and start everything, wait until healthy
	$(COMPOSE) up -d --build --wait
	@echo ""
	@echo "Web:           http://localhost:5173"
	@echo "API health:    http://localhost:4000/health"
	@echo "Mongo browser: http://localhost:8081"

down: check-env ## Stop everything (data is kept)
	$(COMPOSE) down

logs: check-env ## Follow logs from all services
	$(COMPOSE) logs -f --tail=100

ps: check-env ## Show service status and health
	$(COMPOSE) ps

seed: check-env ## Load synthetic data into MongoDB
	$(COMPOSE) exec api npm run seed

test: check-env ## Run API tests inside a container
	$(COMPOSE) run --rm --no-deps api npm test

lint: ## Lint all code (needs Node on your machine)
	npm run lint

reset: check-env ## Stop everything AND delete all data volumes
	$(COMPOSE) down -v
