# API Hub

API Hub transforma qualquer especificação OpenAPI/Swagger (JSON ou YAML, a partir de uma URL) em um site de documentação interativo, com um executor de requisições ("try it") embutido. A aplicação inteira fica atrás de um único login compartilhado. A interface é em português (pt-BR).

## Funcionalidades

- **Carregar specs por URL** — cole a URL de um `openapi.json`/`.yaml` e o app valida, faz o parse e gera a documentação.
- **Múltiplas specs registradas** — cada spec carregada vira uma entrada com slug próprio (`/docs/{slug}`), persistida em Postgres.
- **Try it** — monta requisições reais (path/query/headers/body) e as executa através de um proxy server-side, evitando problemas de CORS.
- **Code samples** — gera snippets prontos (curl, fetch, etc.) para cada operação.
- **Tema claro/escuro** e navegação por tags/operações.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (tema via CSS, sem `tailwind.config.*`)
- [Drizzle ORM](https://orm.drizzle.team) + Postgres (`postgres-js`) como registro das specs
- Sessão via cookie JWT assinado com [`jose`](https://github.com/panva/jose)

## Pré-requisitos

- Node.js 20+
- Um banco Postgres acessível (local, em container ou gerenciado)

## Configuração

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável        | Descrição                                                        |
| --------------- | ------------------------------------------------------------------ |
| `AUTH_USERNAME` | Usuário do login único da instância                                |
| `AUTH_PASSWORD` | Senha do login único da instância                                  |
| `JWT_SECRET`    | Segredo usado para assinar/validar o JWT de sessão                 |
| `DATABASE_URL`  | Connection string do Postgres usado para registrar as specs        |

Sem essas variáveis, o login, todas as rotas protegidas pelo middleware e qualquer página `/docs` falham.

## Rodando localmente

```bash
npm install
npx drizzle-kit migrate   # aplica as migrações no banco apontado por DATABASE_URL
npm run dev                # http://localhost:3000
```

### Scripts

```bash
npm run dev              # servidor de desenvolvimento (next dev)
npm run build            # build de produção
npm run start            # roda o build de produção (precisa de `npm run build` antes)
npm run lint             # eslint .
npm test                 # testes unitários (Vitest, sem banco)
npm run test:integration # testes de integração (Vitest, precisa de DATABASE_URL)
```

> O build (`next.config.mjs` define `typescript.ignoreBuildErrors: true`) não falha por erros de tipo — use `npx tsc --noEmit` para checagem de tipos real.

### Testes

- **Unitários** (`npm test`) — ficam ao lado do código-fonte (`arquivo.test.ts`), cobrem lógica pura (`lib/openapi/*`, `lib/slug.ts`, `lib/auth.ts`) e não precisam de banco.
- **Integração** (`npm run test:integration`) — ficam em `tests/integration/`, rodam contra um Postgres real (nada de mockar o Drizzle) e cobrem `lib/specs-store.ts`, `lib/audit.ts` e os route handlers de auth/specs/proxy chamados diretamente como função. Exigem `DATABASE_URL` apontando para um banco já migrado:

  ```bash
  DATABASE_URL=postgres://test:test@localhost:5432/api_hub_test npx drizzle-kit migrate
  DATABASE_URL=postgres://test:test@localhost:5432/api_hub_test npm run test:integration
  ```

### Banco de dados (registro de specs + auditoria)

O schema vive em `lib/db/schema.ts` (tabelas `specs` e `audit_logs`), a conexão singleton em `lib/db/client.ts`. O CLI do Drizzle é orientado por `drizzle.config.ts`:

```bash
npx drizzle-kit generate   # cria uma nova migração a partir de mudanças no schema.ts
npx drizzle-kit migrate    # aplica migrações pendentes em DATABASE_URL
npx drizzle-kit studio     # navega pelo banco
```

### Auditoria e retenção de logs

Toda ação sensível (login, logout, criar/atualizar/remover spec, requisição via proxy) grava uma linha em `audit_logs` (`lib/audit.ts#logAudit`) com `action`, `actor`, `status`, `metadata`, `ip` e `user-agent` — nunca headers/bodies de requisição (podem conter tokens/PII). O modo é **estrito**: se o insert do log de auditoria falhar, a ação principal é rejeitada (`500`) em vez de seguir sem deixar rastro. Para `spec.created`/`spec.updated`/`spec.deleted` isso acontece dentro da mesma transação Postgres do `saveSpec`/`deleteSpec`, então uma falha no log também desfaz a alteração da spec.

A retenção é de **1 ano**: `scripts/audit-cleanup.mjs` remove linhas de `audit_logs` com mais de 1 ano (`DELETE ... WHERE created_at < now() - interval '1 year'`). Esse script não roda dentro da própria aplicação — é acionado externamente via uma **Scheduled Task do Coolify** (a plataforma de deploy), configurada com:

- Comando: `node scripts/audit-cleanup.mjs`
- Agendamento: `0 3 * * *` (diariamente às 03:00)

Como a Scheduled Task do Coolify executa dentro do container já em produção, o script tem acesso direto a `DATABASE_URL` do ambiente sem precisar de nenhum endpoint HTTP novo ou segredo adicional.

## Deploy com Docker

O projeto inclui um `Dockerfile` multi-stage (build standalone do Next.js) e um `docker-compose.yml` que sobe a aplicação junto com um Postgres.

### Subindo com docker-compose (app + Postgres incluído)

1. Configure o `.env` na raiz do projeto (mesmas variáveis da tabela acima). Se `DATABASE_URL` ficar vazio, o `docker-compose.yml` aponta automaticamente para o serviço `postgres` do compose.
2. Suba os containers:

   ```bash
   docker compose up -d --build
   ```

3. A aplicação fica disponível em `http://localhost:3000` (porta configurável via `APP_PORT`).

As migrações do Drizzle são aplicadas automaticamente no início do container da aplicação (`scripts/migrate.mjs`, executado antes do `next start` no `CMD` do `Dockerfile`), então não é preciso rodar `drizzle-kit migrate` manualmente.

### Usando um Postgres externo/gerenciado

Defina `DATABASE_URL` no `.env` apontando para o banco externo — o `docker-compose.yml` usa esse valor no lugar do Postgres embutido automaticamente. Nesse caso o serviço `postgres` do compose pode ser removido ou simplesmente ignorado.

### Build manual da imagem (sem compose)

```bash
docker build -t api-hub .
docker run -d \
  -p 3000:3000 \
  -e AUTH_USERNAME=... \
  -e AUTH_PASSWORD=... \
  -e JWT_SECRET=... \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  --name api-hub \
  api-hub
```

## CI

`.github/workflows/ci.yml` roda em push/PR para `main`: `lint-and-typecheck` (eslint + `tsc --noEmit`), `unit-tests` (`npm test`), `integration-tests` (Postgres como serviço do workflow + `npm run test:integration`) e `build` (`npm run build`). Não há job de deploy — CD fica fora de escopo por enquanto.

## Arquitetura (visão geral)

- **`middleware.ts`** protege `/`, `/docs/:path*`, `/api/spec/:path*`, `/api/specs/:path*` e `/api/proxy/:path*`, checando o cookie de sessão (`lib/auth.ts`). Páginas sem sessão são redirecionadas para `/login`; rotas de API recebem `401`.
- **`lib/specs-store.ts`** persiste specs registradas (`{ slug, sourceUrl, title, description, version }`) em Postgres, casando por `sourceUrl`. O slug é derivado do título na criação e nunca muda depois.
- **`lib/openapi/parser.ts#parseOpenAPI`** é o ponto único de entrada que transforma uma spec crua em `ParsedSpec`, resolvendo `$ref`s locais e agrupando operações por tag.
- **`components/api-hub/api-hub.tsx`** é o componente client de topo que guarda o estado (spec crua, operação selecionada, etc.) e deriva o `ParsedSpec` via `useMemo`.
- **`components/api-hub/try-it.tsx`** monta a requisição e a envia para `app/api/proxy/route.ts`, que faz o fetch real no servidor (evitando CORS no browser).

Mais detalhes de arquitetura, fluxo de dados e convenções estão em [`CLAUDE.md`](./CLAUDE.md).

## Licença

Uso interno — sem licença pública definida.
