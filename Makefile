COMPOSE_FILE := docker-compose.api.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)
NETWORK := caxiauto-net
NGINX_DIR := /home/lantonio/nginx
BLUE := caxinda-api-blue
GREEN := caxinda-api-green

.PHONY: help network build build-blue build-green up down start stop restart logs ps config health swap recreate

help:
	@echo "Comandos disponíveis:"
	@echo "  make network      - Cria a rede $(NETWORK) se não existir"
	@echo "  make build        - Build das imagens blue e green (sem cache, com pull)"
	@echo "  make build-blue   - Build apenas da imagem blue"
	@echo "  make build-green  - Build apenas da imagem green"
	@echo "  make up           - Sobe redis + api-blue e aponta o nginx"
	@echo "  make down         - Remove os recursos do compose"
	@echo "  make start        - Inicia os containers existentes"
	@echo "  make stop         - Para os containers"
	@echo "  make restart      - Reinicia os containers"
	@echo "  make logs         - Exibe logs em tempo real"
	@echo "  make ps           - Mostra status dos serviços"
	@echo "  make config       - Valida e renderiza o compose"
	@echo "  make health       - Aguarda o container ativo ficar healthy"
	@echo "  make swap         - Alterna o nginx para o outro container (blue<->green)"
	@echo "  make recreate     - Deploy zero downtime (blue/green) sem cache nem lixo"

network:
	docker network create $(NETWORK) || true

build: network
	$(COMPOSE) build --pull --no-cache api-blue api-green

build-blue: network
	$(COMPOSE) build --pull --no-cache api-blue

build-green: network
	$(COMPOSE) build --pull --no-cache api-green

up: network
	@$(MAKE) --no-print-directory build-blue
	$(COMPOSE) up -d redis api-blue
	@$(MAKE) --no-print-directory health CONTAINER=$(BLUE)
	@echo "Apontando nginx para $(BLUE)..."
	@$(MAKE) --no-print-directory -C $(NGINX_DIR) reload-caxinda CAXINDA_UPSTREAM_HOST=$(BLUE)

down:
	$(COMPOSE) down

start:
	$(COMPOSE) start

stop:
	$(COMPOSE) stop

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f api-blue api-green redis

ps:
	$(COMPOSE) ps

config:
	$(COMPOSE) config

health:
	@CONTAINER="$(or $(CONTAINER),$(BLUE))"; \
	n=0; \
	until [ "$$(docker inspect -f '{{.State.Health.Status}}' "$$CONTAINER" 2>/dev/null)" = "healthy" ]; do \
		n=$$((n+1)); \
		if [ $$n -gt 40 ]; then \
			echo "ERRO: $$CONTAINER nao ficou healthy em tempo util."; \
			docker ps -a --filter name=$$CONTAINER; \
			exit 1; \
		fi; \
		echo "Aguardando $$CONTAINER ficar healthy..."; \
		sleep 3; \
	done; \
	echo "$$CONTAINER healthy."

swap:
	@ACTIVE=$$(docker ps --filter name=caxinda-api- --format '{{.Names}}' | grep -E '^($(BLUE)|$(GREEN))$$' || true); \
	case "$$ACTIVE" in \
		$(BLUE)) NEXT=$(GREEN);; \
		$(GREEN)) NEXT=$(BLUE);; \
		*) NEXT=$(BLUE);; \
	esac; \
	echo "Ativo: $$ACTIVE -> Alternando nginx para $$NEXT"; \
	$(MAKE) --no-print-directory -C $(NGINX_DIR) reload-caxinda CAXINDA_UPSTREAM_HOST=$$NEXT

recreate:
	@set -e; \
	docker network create $(NETWORK) || true; \
	ACTIVE=$$(docker ps --filter name=caxinda-api- --format '{{.Names}}' | grep -E '^($(BLUE)|$(GREEN))$$' | sed 's/^caxinda-api-//'); \
	if [ -z "$$ACTIVE" ]; then \
		ACTIVE=blue; NEXT=green; \
	elif [ "$$ACTIVE" = "blue" ]; then \
		NEXT=green; \
	else \
		NEXT=blue; \
	fi; \
	echo "Ativo: caxinda-api-$$ACTIVE -> Deploy zero downtime para caxinda-api-$$NEXT"; \
	$(COMPOSE) build --pull --no-cache api-$$NEXT; \
	$(COMPOSE) up -d --no-deps api-$$NEXT; \
	$(MAKE) --no-print-directory health CONTAINER=caxinda-api-$$NEXT; \
	echo "Trocando nginx para caxinda-api-$$NEXT..."; \
	$(MAKE) --no-print-directory -C $(NGINX_DIR) reload-caxinda CAXINDA_UPSTREAM_HOST=caxinda-api-$$NEXT; \
	$(COMPOSE) stop api-$$ACTIVE; \
	docker rm -f caxinda-api-$$ACTIVE 2>/dev/null || true; \
	echo "Limpando cache e lixo do armazenamento..."; \
	docker image prune -f; \
	docker builder prune -f; \
	echo "Deploy concluido. Ativo: caxinda-api-$$NEXT"