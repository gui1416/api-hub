# API Hub

API Hub transforma qualquer especificação OpenAPI/Swagger (JSON ou YAML, a partir de uma URL) em um site de documentação interativo, com um executor de requisições ("try it") embutido e um assistente de IA para conversar sobre as APIs documentadas. A aplicação é multi-usuário: contas ficam no Postgres e o acesso é controlado por grupos e permissões (RBAC). A interface é em português (pt-BR).

## Funcionalidades

- **Carregar specs por URL** — cole a URL de um `openapi.json`/`.yaml` e o app valida, faz o parse e gera a documentação.
- **Múltiplas specs registradas** — cada spec carregada vira uma entrada com slug próprio (`/docs/{slug}`), persistida em Postgres.
- **Try it** — monta requisições reais (path/query/headers/body) e as executa através de um proxy server-side, evitando problemas de CORS.
- **Code samples** — gera snippets prontos (curl, fetch, etc.) para cada operação.
- **Chat com IA sobre a spec** — assistente (Cmd+K → "Conversar sobre esta API" ou Ctrl+I) com contexto da spec aberta, `@menção` de outras specs registradas, streaming, fallback entre providers e circuit breaker. Histórico de conversas isolado por usuário.
- **Multi-usuário com RBAC macro/micro** — usuários pertencem a grupos, grupos concedem permissões (catálogo editável pela UI), separadas entre telas/rotas (`docs.view`, `admin.*`) e ações (`specs.load`, `specs.delete`, `proxy.use`, `chat.use`). Cada grupo também controla **quais specs** seus membros enxergam ("todas" ou uma lista específica) — a ACL vale para a lista do palette, o `/docs/{slug}` e o chat de IA.
- **Command palette global (Cmd+K)** — disponível em qualquer tela autenticada: navegar entre as specs permitidas (a documentação padrão do hub aparece como uma spec), carregar nova URL, abrir o chat e acessar as telas administrativas, tudo filtrado pelas permissões do usuário. Os botões da home abrem o palette.
- **Telas administrativas** (via command palette, Cmd+K, com header global em todas):
  - `/admin/users` e `/admin/groups` — console de diretório no estilo do "Active Directory Users and Computers": árvore de containers (Usuários / Grupos / Permissões) à esquerda, lista de objetos com busca à direita, e duplo clique abrindo "Propriedades" com abas — usuário: Geral (perfil completo: nome e email obrigatórios; telefone, empresa e cargo opcionais), Conta (ativar/desativar, resetar senha, remover — com salvaguardas contra auto-remoção e remoção do último admin — e último login/logout) e Membro de; grupo: Geral, Membros (gestão pelo lado do grupo), Permissões (seções Telas/Ações/Personalizadas) e Specs (acesso por grupo — incluindo a própria "Documentação do API Hub", que participa da ACL como uma pseudo-spec). Criação de usuário gera senha temporária exibida uma única vez, com troca obrigatória no primeiro login.
  - `/admin/dashboard` — uso de tokens de IA por chave (provider), por modelo e por usuário, com filtro de período.
  - `/config-ia` — providers de IA (chaves criptografadas em repouso) e regras globais que entram no system prompt do assistente. Clicar num provider abre um relatório completo de uso (tokens por dia, por modelo, por usuário, latência, fallbacks e estado de cooldown).
- **Logout forçado** — desativar/remover um usuário derruba a sessão dele na request seguinte (o middleware revalida status e permissões no banco a cada request), e um watcher no client encerra sessões mortas sem esperar navegação.
- **Auditoria estrita** — toda ação sensível gera uma linha em `audit_logs`; se o registro falhar, a ação é rejeitada.
- **Tema claro/escuro** e navegação por tags/operações.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (tema via CSS, sem `tailwind.config.*`)
- [Drizzle ORM](https://orm.drizzle.team) + Postgres (`postgres-js`) — usuários/RBAC, specs, configuração de IA e auditoria
- Sessão via cookie JWT assinado com [`jose`](https://github.com/panva/jose); senhas com hash [`bcryptjs`](https://github.com/dcodeIO/bcrypt.js)
- [Vercel AI SDK](https://sdk.vercel.ai) (`ai` + `@ai-sdk/openai-compatible`) para o chat — cobre Groq, OpenAI, OpenRouter, Ollama e afins

## Pré-requisitos

- Node.js 20+
- Um banco Postgres acessível (local, em container ou gerenciado)

## Configuração

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável                                                   | Descrição                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_USERNAME` / `AUTH_PASSWORD`                           | Credenciais do **primeiro admin** — lidas uma única vez por `npm run seed:admin`. Depois do seed podem ser removidas; o login não as lê.     |
| `JWT_SECRET`                                                | Segredo usado para assinar/validar o JWT de sessão                                                                                          |
| `DATABASE_URL`                                              | Connection string do Postgres                                                                                                               |
| `AI_CONFIG_ENCRYPTION_KEY`                                  | Chave (32 bytes em base64, `openssl rand -base64 32`) que criptografa as API keys dos providers de IA em repouso                             |
| `AI_RATE_LIMIT_TOKENS_PER_HOUR` / `AI_RATE_LIMIT_TOKENS_PER_DAY` | Tetos de consumo de tokens do chat (padrões conservadores no `.env.example`)                                                          |

## Rodando localmente

```bash
npm install
npx drizzle-kit migrate   # aplica as migrações no banco apontado por DATABASE_URL
npm run seed:admin        # cria o primeiro usuário admin (uma única vez; idempotente)
npm run dev               # http://localhost:3000
```

O seed cria o usuário de `AUTH_USERNAME`/`AUTH_PASSWORD` já no grupo **Administradores**. Novos usuários são criados pela tela `/admin/users` (não há signup): cada um recebe uma senha temporária, exibida uma única vez, e é obrigado a trocá-la no primeiro login. Usuários sem grupo escolhido entram no grupo **Usuários** (`docs.view` + `chat.use`).

### Scripts

```bash
npm run dev              # servidor de desenvolvimento (next dev)
npm run build            # build de produção
npm run start            # roda o build de produção (precisa de `npm run build` antes)
npm run lint             # eslint .
npm test                 # testes unitários (Vitest, sem banco)
npm run test:integration # testes de integração (Vitest, precisa de DATABASE_URL)
npm run seed:admin       # bootstrap do primeiro admin (idempotente)
```

> O build (`next.config.mjs` define `typescript.ignoreBuildErrors: true`) não falha por erros de tipo — use `npx tsc --noEmit` para checagem de tipos real.

### Testes

- **Unitários** (`npm test`) — ficam ao lado do código-fonte (`arquivo.test.ts`), cobrem lógica pura (`lib/openapi/*`, `lib/auth.ts`, `lib/rbac.ts`, `lib/ai/*`) e não precisam de banco.
- **Integração** (`npm run test:integration`) — ficam em `tests/integration/`, rodam contra um Postgres real (nada de mockar o Drizzle) com os route handlers chamados diretamente como função.

  ⚠️ **Os testes de integração são destrutivos** (apagam linhas de `users`, `specs`, `audit_logs`, `ai_conversations`). Nunca rode com `DATABASE_URL` apontando para o banco real. Use o runner seguro, que cria/migra um banco descartável `apihub_test` no mesmo servidor:

  ```bash
  bash scripts/_run-integration.sh
  ```

  Ou, manualmente, contra um banco de teste:

  ```bash
  DATABASE_URL=postgres://test:test@localhost:5432/api_hub_test npx drizzle-kit migrate
  DATABASE_URL=postgres://test:test@localhost:5432/api_hub_test npm run test:integration
  ```

Não há workflow de CI no repositório no momento (foi removido para destravar o deploy) — lint, testes e build são executados manualmente.

### Banco de dados

O schema vive em `lib/db/schema.ts` — usuários e RBAC (`users`, `groups`, `permissions`, `group_permissions`, `user_groups`), specs (`specs`), IA (`ai_providers`, `ai_conversations`, `ai_messages`, `ai_settings`) e auditoria (`audit_logs`). A conexão singleton fica em `lib/db/client.ts`. O CLI do Drizzle é orientado por `drizzle.config.ts`:

```bash
npx drizzle-kit generate   # cria uma nova migração a partir de mudanças no schema.ts
npx drizzle-kit migrate    # aplica migrações pendentes em DATABASE_URL
npx drizzle-kit studio     # navega pelo banco
```

A migração `0003` faz o seed do catálogo inicial de permissões e dos grupos de sistema `Administradores` e `Usuários` (que não podem ser removidos, evitando a instância ficar sem admin). A `0004` adiciona os campos de perfil do usuário (nome/email/telefone/empresa/cargo), a ACL de specs por grupo (`groups.all_specs` + `group_specs`) e substitui `specs.manage` pelas ações `specs.load`/`specs.delete`, além de introduzir `proxy.use` (concedida automaticamente a grupos que tinham `docs.view`).

### Auditoria e retenção de logs

Toda ação sensível — login/logout, criar/atualizar/remover spec, requisição via proxy, mudanças de configuração de IA e todas as mutações administrativas (usuários, grupos, permissões, reset/troca de senha) — grava uma linha em `audit_logs` (`lib/audit.ts#logAudit`) com `action`, `actor` (username), `status`, `metadata`, `ip` e `user-agent` — nunca headers/bodies de requisição (podem conter tokens/PII). O modo é **estrito**: se o insert do log falhar, a ação principal é rejeitada (`500`) em vez de seguir sem rastro; mutações rodam na mesma transação do log, então a falha também desfaz a alteração.

A retenção é de **1 ano**: `scripts/audit-cleanup.mjs` remove linhas com mais de 1 ano. O script é acionado externamente via uma **Scheduled Task do Coolify**:

- Comando: `node scripts/audit-cleanup.mjs`
- Agendamento: `0 3 * * *` (diariamente às 03:00)

Como a Scheduled Task executa dentro do container já em produção, o script tem acesso direto a `DATABASE_URL` do ambiente sem precisar de endpoint HTTP novo ou segredo adicional.

## Deploy com Docker

O projeto inclui um `Dockerfile` multi-stage (build standalone do Next.js) e um `docker-compose.yml` que sobe a aplicação junto com um Postgres.

### Subindo com docker-compose (app + Postgres incluído)

1. Configure o `.env` na raiz do projeto (mesmas variáveis da tabela acima). Se `DATABASE_URL` ficar vazio, o `docker-compose.yml` aponta automaticamente para o serviço `postgres` do compose.
2. Suba os containers:

   ```bash
   docker compose up -d --build
   ```

3. A aplicação fica disponível em `http://localhost:3000` (porta configurável via `APP_PORT`).
4. Na primeira subida, crie o admin inicial dentro do container:

   ```bash
   docker compose exec app node scripts/seed-admin.mjs
   ```

As migrações do Drizzle são aplicadas automaticamente no início do container da aplicação (`scripts/migrate.mjs`, executado antes do server no `CMD` do `Dockerfile`). O seed do admin é um passo manual único — é idempotente (não faz nada se já existir qualquer usuário).

### Usando um Postgres externo/gerenciado

Defina `DATABASE_URL` no `.env` apontando para o banco externo — o `docker-compose.yml` usa esse valor no lugar do Postgres embutido automaticamente. Nesse caso o serviço `postgres` do compose pode ser removido ou simplesmente ignorado.

### Build manual da imagem (sem compose)

```bash
docker build -t api-hub .
docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET=... \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  -e AI_CONFIG_ENCRYPTION_KEY=... \
  -e AUTH_USERNAME=... \
  -e AUTH_PASSWORD=... \
  --name api-hub \
  api-hub
docker exec api-hub node scripts/seed-admin.mjs   # uma única vez
```

## Arquitetura (visão geral)

- **`middleware.ts`** (runtime Node) é o gate de autenticação **e** autorização: valida o cookie de sessão, revalida status + permissões efetivas do usuário no banco a cada request (usuário desativado/removido cai na hora), força o fluxo de troca de senha quando pendente, aplica o mapa rota → permissão (`lib/rbac.ts`) e injeta a identidade em headers `x-user-*` não-spoofáveis para as rotas downstream.
- **`lib/rbac.ts`** resolve as permissões efetivas (usuário → grupos → permissões) em uma query e define qual permissão cada prefixo de rota exige.
- **`lib/specs-store.ts`** persiste specs registradas em Postgres, casando por `sourceUrl`. O slug é derivado do título na criação e nunca muda depois.
- **`lib/openapi/parser.ts#parseOpenAPI`** é o ponto único de entrada que transforma uma spec crua em `ParsedSpec`, resolvendo `$ref`s locais e agrupando operações por tag.
- **`components/api-hub/api-hub.tsx`** é o componente client de topo que guarda o estado (spec crua, operação selecionada, palette, chat) e deriva o `ParsedSpec` via `useMemo`.
- **`components/api-hub/try-it.tsx`** monta a requisição e a envia para `app/api/proxy/route.ts`, que faz o fetch real no servidor (evitando CORS no browser).
- **`app/api/ai/*`** implementa o chat: conversas por usuário, system prompt composto por regras do admin (`ai_settings`) + contexto derivado do usuário (nome, grupos, permissões) + resumo da spec, com fallback ordenado entre providers e circuit breaker (`lib/ai/provider-client.ts`).

Mais detalhes de arquitetura, fluxo de dados e convenções estão em [`CLAUDE.md`](./CLAUDE.md).

## Licença

Uso interno — sem licença pública definida.
