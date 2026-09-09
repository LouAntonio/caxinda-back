# Caxinda API

Backend do **Caxinda**, um marketplace de classificados de Angola (compra e venda de produtos e serviços, empresas geridas por promoters, verificação de identidade e pagamentos).

Stack: **NestJS 11**, **Prisma 7 + PostgreSQL (Neon)**, **better-auth** (magic link + OAuth Google), **BullMQ + Redis**, **Socket.IO**, **Cloudinary**, **Resend**, **Winston**.

> O idioma do domínio (mensagens de erro, nomes de recursos) é o **português**.

## Índice

- [Pré-requisitos](#pré-requisitos)
- [Configuração](#configuração)
- [Scripts](#scripts)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Autenticação e autorização](#autenticação-e-autorização)
- [Principais módulos](#principais-módulos)
- [Chat (REST + Socket.IO)](#chat-rest--socketio)
- [Rate limiting](#rate-limiting)
- [Paginação e busca](#paginação-e-busca)
- [Qualidade e testes](#qualidade-e-testes)

## Pré-requisitos

- Node.js 22+
- PostgreSQL (o projeto usa banco remoto migrations em Neon, mas roda local em qualquer Postgres)
- Redis (BullMQ, cache e prefixo do rate-limit quando configurado)

## Configuração

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o ficheiro `.env` a partir do exemplo:

   ```bash
   cp .env.example .env
   ```

   Preencha bases de dados, credenciais e segredos (ver [Variáveis de ambiente](#variáveis-de-ambiente)).

3. Aplique as migrações e gere o client Prisma:

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

4. Arranque em modo de desenvolvimento:

   ```bash
   npm run start:dev
   ```

A API fica disponível em `http://localhost:3000`; a documentação Swagger em `http://localhost:3000/api/docs`.

> **Nota (Neon/PgBouncer):** o `pooler` do Neon usa transaction-mode e não suporta `CREATE TYPE` nem advisory locks. Para correr migrações use a URL **direta** (sem `-pooler` no host).

## Variáveis de ambiente

Ver `.env.example`. Destaques:

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | URL do Postgres (Prisma + app) |
| `REDIS_URL` | Redis para BullMQ/cache/rate-limit |
| `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET` | base URL e segredo do better-auth |
| `CORS_ORIGINS` | origens permitidas (separadas por `,`) |
| `FRONT_URL` | URL do frontend (links de magic link) |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | regra global default do rate-limit (ms / pedidos) |
| `THROTTLE_AUTH_LIMIT` / `THROTTLE_AUTH_TTL_MS` | regra específica de auth (login/password reset) |
| `THROTTLE_CHAT_LIMIT` / `THROTTLE_CHAT_TTL_MS` | regra específica do chat REST |
| `THROTTLE_SUPPORT_LIMIT` / `THROTTLE_SUPPORT_TTL_MS` | regra específica de suporte (claim/release/resolve) |
| `THROTTLE_PAYMENT_LIMIT` / `THROTTLE_PAYMENT_TTL_MS` | regra específica de pagamentos |
| `NODE_ENV` | `development` / `production` |

## Scripts

```bash
npm run start:dev      # modo watch
npm run build          # compilação para dist/
npm run start:prod     # arranca dist/main.js
npm run typecheck      # tsc --noEmit
npm run lint           # eslint com --fix
npm run lint:check     # eslint sem correção automática
npm run format         # prettier --write
npm run format:check   # prettier --check
npm run test           # jest (unit + integração)
npm test -- <path>     # testa um módulo específico
npx prisma migrate dev # cria/aplica migração no dev
npx prisma studio      # UI para inspecionar a DB
```

## Estrutura do projeto

```
src/
├── app.module.ts            # importa módulos; guards globais (Throttler + Permissions)
├── auth/                    # better-auth, guards (permissions), decorators @Public/@Roles
├── ads/                     # anúncios (CRUD, moderação, proximidade, destaque)
├── analytics/               # métricas de views/cliques alimentadas por BullMQ
├── business/                # empresas (promoters)
├── cache/                   # módulo de cache (Redis)
├── categories/              # categorias de anúncios/empresas
├── chat/                    # conversas, messages, gateway Socket.IO, suporte
├── common/                  # prisma, cloudinary, resend, DTOs e helpers compartilhados
├── kyc/                     # verificação de identidade (BI)
├── payments/                # pagamentos/subscriptions
├── reports/                 # denúncias de anúncios/utilizadores/mensagens
├── reviews/                 # avaliações de ad/business
├── search/                  # busca global pública (anúncios + empresas + utilizadores)
├── users/                   # perfis públicos, wishlist relacionada, roles
└── wishlist/                # favoritos
```

## Autenticação e autorização

- **Auth**: better-auth (email+senha, Google OAuth e magic link); sessões via cookie.
- **Verificação de email**: o login por email+senha exige email verificado
  (`requireEmailVerification`). Contas criadas via **Google** ou **magic link**
  nascem verificadas; o registo por email+senha envia um link de verificação
  (reenviado automaticamente em cada tentativa de login enquanto não verificado,
  com `sendOnSignIn`).
- **Guard global `PermissionsGuard`** (`APP_GUARD`): por omissão qualquer rota exige sessão.
  - `@Public()` — marca a rota (ou controller) como pública.
  - `@Roles(Role.ADMIN, ...)` — restringe a funções específicas.
  - `@Permissions(...)` — verifica permissões (RBAC) via better-auth.
- A ordem dos guards globais: `ThrottlerGuard` → `PermissionsGuard`.

## Principais módulos

| Módulo | Público? | Endpoints principais |
| --- | --- | --- |
| Auth | parcial | `POST /api/auth/magic-link/send`, `/magic-link/verify`, Google, `GET /me` |
| Ads | parcial | `GET /ads`, `GET /ads/:slug`, `POST /ads` (privado), admin `GET /ads/admin/*` |
| Business | parcial | `GET /business`, `GET /business/:slug`, CRUD do owner |
| Categories | sim | `GET /categories`, `GET /categories/:slug` |
| Search | sim | `GET /search?q=...&type=AD|BUSINESS|USER&page=&limit=` |
| Users | parcial | `GET /users/:id/public` (público), wishlist e gestão própria (privado) |
| Reviews | parcial | `GET /reviews` por alvo (público), criação (privado) |
| Reports | parcial | `GET /reports/count` (público), list/criar (privado, staff) |
| Payments | privado | subscriptions, comprovativos, aprovação (staff) |
| Analytics | privado/staff | métricas por ad/business, feeds por BullMQ |

## Chat (REST + Socket.IO)

O chat mistura **REST** (recomendado para payloads grandes, e.g. mídia) com **Socket.IO** (tempo real).

- REST: `POST /conversations` cria/reusa conversa (`adId`, `businessId` ou `type: SUPPORT`). `GET`, `GET/:id/messages`, `POST/:id/messages`, `POST/:id/read`.
- Socket.IO (gateway `ChatsGateway`, espaço `conversation/:id`):
  - `conversation:join` / `conversation:leave` — entrada/saída da sala.
  - `message:send` — envia mensagem e notifica a sala + `conversation:unread` ao destinatário.
  - `conversation:read`, `message:typing`, `presence:update`.
  - `conversation:new-support` — avisa a sala `staff` quando um utilizador cria uma conversa de suporte nova.

### Fluxo de suporte

1. O utilizador chama `POST /conversations` com `{ type: 'SUPPORT' }` → reusa a conversa aberta (`OPEN`/`IN_PROGRESS`) ou cria nova; staff online recebe `conversation:new-support`.
2. `POST /conversations/:id/claim` (staff) → atribui ao agente (status `IN_PROGRESS`) e adiciona-o como participante.
3. `POST /conversations/:id/release` (staff atribuído/admin) → devolve à fila (`OPEN`) e remove o participante staff.
4. `PATCH /conversations/:id/resolve` (staff atribuído/admin) → status `RESOLVED`.
5. Mensagens novas numa conversa `RESOLVED` reabrem a conversa (`IN_PROGRESS` se ainda atribuída, senão `OPEN`).

## Rate limiting

- **Default**: regra global definida por `THROTTLE_TTL`/`THROTTLE_LIMIT`.
- **Regras específicas** por controller: auth (`THROTTLE_AUTH_*`), chat REST (`THROTTLE_CHAT_*`), endpoints de suporte (`THROTTLE_SUPPORT_*`), pagamentos (`THROTTLE_PAYMENT_*`).
- Storage por omissão em memória; quando `REDIS_URL` está presente o thin-store (TTL/foneKey) é usado.
- Respostas `429` incluem os cabeçalhos `Retry-After` e `X-RateLimit-*`.

## Paginação e busca

- Paginação padrão em `PaginationQueryDto` (`page`, `limit`, máx. 50; admin de anúncios máx. 100), com helpers `buildPagination`/`paginate` e `totalPages` na resposta.
- Busca por palavra-chave padronizada com `buildSearchOR(fields, q)` (`contains`, `insensitive`) — usada em anúncios, empresas e avisos do admin.
- Busca global `GET /search` agrega anúncios (título/descrição), empresas (nome/descrição/telefone) e utilizadores (nome/apelido), ordenados por relevância, com filtros `type`, `categoryId` e `province`.

## Qualidade e testes

O pipeline exige `typecheck`, `lint:check`, `format:check` e os testes Jest:

```bash
npm run typecheck
npm run lint:check
npm run format:check
npm test
```