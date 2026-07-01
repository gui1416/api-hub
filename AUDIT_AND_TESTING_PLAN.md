# Plano: Auditoria (DB, retenção 1 ano) + Testes automatizados + CI

## Contexto

O projeto hoje não tem nenhuma rede de segurança automatizada: `CLAUDE.md` já avisa que "there is no test suite configured", e a pesquisa nesta sessão confirmou que isso vai além disso — **o `eslint` nem está instalado** (o script `lint` em `package.json` referencia um binário que não existe em `node_modules`), não há `.github/workflows` nem qualquer outro CI, e nenhuma ação do app (login, criar/editar/remover spec, o proxy que faz requisições HTTP arbitrárias) deixa rastro algum — `app/api/proxy/route.ts`, a rota de maior risco (SSRF-shaped, sem allowlist de host), não tem um único `console.log`.

Isso foi pedido agora porque o projeto está saindo de "protótipo local" para algo que precisa de trilha de auditoria (compliance) e uma rede de proteção antes de crescer mais. As decisões abaixo já foram confirmadas com o usuário:

- **CD**: fora de escopo por enquanto — o pipeline cobre só CI (lint, typecheck, testes, build). Sem host de produção definido ainda.
- **Retenção dos logs**: via **Coolify** (a plataforma de deploy já usada/planejada) — Coolify tem um recurso de *Scheduled Tasks* que roda um comando dentro do container já em produção, então a limpeza é um script chamado por esse agendamento, não um cron dentro do próprio repo/app.
- **Falha ao gravar log de auditoria = estrito**: se o insert do log falhar, a ação principal (login, criar/editar/remover spec, proxy) é rejeitada. Prioriza completude do rastro de auditoria sobre disponibilidade — trade-off consciente do usuário, documentado abaixo por rota.

## Parte 0 — Pré-requisito: consertar o ESLint

`npm run lint` falha hoje porque `eslint` não está instalado (confirmado: sem `node_modules/eslint`, sem `eslint.config.*`/`.eslintrc*`). Isso bloqueia o job de lint do CI, então é o primeiro passo:
- Adicionar `eslint`, `eslint-config-next` (ou equivalente flat-config compatível com Next 16) e `typescript-eslint` como devDependencies.
- Criar `eslint.config.mjs` (flat config) estendendo as regras do Next.
- Rodar `npm run lint` uma vez pra confirmar que não introduz uma avalanche de erros em código já existente (se introduzir, ajustar regras pontuais, não desabilitar o linter).

## Parte 1 — Testes automatizados

**Framework: Vitest** (não Jest) — ESM nativo, zero config extra pra rodar TypeScript puro, e a maior parte do que precisa de cobertura é lógica pura (`lib/openapi/*`) ou route handlers do App Router, que são só funções `async (req: Request) => Response` — dá pra chamar diretamente em teste, sem subir servidor nem usar `supertest`.

### Camada 1 — Unit tests (sem banco, rápidos)
Colocados ao lado do código-fonte (`arquivo.test.ts` junto de `arquivo.ts`), cobrindo a lógica mais crítica/complexa já mapeada:
- `lib/openapi/parser.ts` — resolução de `$ref`, proteção contra ciclo, agrupamento por tag, normalização de parâmetros/request body/responses
- `lib/openapi/example.ts` — geração de exemplo a partir de JSON Schema (com/sem `example`/`default`/`enum`/`format`)
- `lib/openapi/code-samples.ts` — snippets gerados têm a forma esperada
- `lib/openapi/spec-info.ts` — extração de título/descrição/versão com campos ausentes
- `lib/slug.ts` — casos de borda do slugify
- `lib/auth.ts` — `createSessionToken`/`verifySessionToken` (round-trip, token expirado, token inválido) — usa `JWT_SECRET` de teste

### Camada 2 — Integration tests (com Postgres real, mais lentos)
Em `tests/integration/*.test.ts`, contra um Postgres efêmero real (nada de mockar o Drizzle — é frágil e não pega erros de SQL/schema de verdade):
- `lib/specs-store.ts` — `saveSpec`/`getSpec`/`listSpecs`/`deleteSpec`
- `lib/audit.ts` (novo, Parte 2) — grava e consulta linhas de auditoria
- Route handlers chamados diretamente como função (padrão a reaproveitar em todos): `POST(new Request('http://test/api/auth/login', { method: 'POST', body: ... }))` e assert no `Response` retornado — cobre `app/api/auth/login`, `app/api/specs`, `app/api/specs/[slug]`, e (com um mock leve do `fetch` de saída) `app/api/proxy`.

Dois configs de Vitest (`vitest.config.ts` exclui `tests/integration/**`; `vitest.integration.config.ts` inclui só essa pasta) — permite rodar unit tests sem banco no dia a dia, e separar o job mais lento no CI. Scripts novos em `package.json`: `test` (unit) e `test:integration`.

**Fora de escopo desta rodada**: testes E2E de navegador (Playwright). A cobertura de rota via chamada direta ao handler (camada 2) já fecha o essencial pedido ("testes automatizados/unitários"); E2E fica como próximo passo natural, não construído agora pra não inflar o escopo.

## Parte 2 — Auditoria em banco de dados

### Schema novo (`lib/db/schema.ts`, mesma convenção da tabela `specs`)

```ts
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  action: text('action').notNull(),       // 'auth.login', 'auth.logout', 'spec.created', 'spec.updated', 'spec.deleted', 'proxy.request'
  actor: text('actor').notNull(),         // username autenticado, ou 'anonymous' pra tentativa de login falhada
  status: text('status').notNull(),       // 'success' | 'failure'
  metadata: jsonb('metadata'),            // detalhes específicos da ação (ver política de redação abaixo)
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}))
```

Nova migração via `npx drizzle-kit generate` (segue o fluxo já existente, sem nada especial).

**Sobre "quem" fez a ação**: `lib/auth.ts` confirma que é uma conta única compartilhada (`sub` no JWT é literalmente o `AUTH_USERNAME`) — não existe identidade por pessoa. `actor` vai gravar esse username fixo pras ações autenticadas; não há como (nem é o objetivo aqui) diferenciar humanos por trás da conta única.

**Política de redação (importante)**: `metadata` do proxy grava `{ method, url, status, durationMs }` — **nunca** headers/bodies de request ou response (podem conter tokens, chaves de API, PII). Isso é uma decisão deliberada, não um esquecimento.

### `lib/audit.ts` (novo helper)

```ts
export async function logAudit(entry: {
  action: string
  actor: string
  status: 'success' | 'failure'
  metadata?: Record<string, unknown>
  request?: Request // usado só pra extrair ip (x-forwarded-for) e user-agent
}): Promise<void>
```

Faz um `insert` simples — **lança erro se o insert falhar** (não engole silenciosamente), porque o modo é estrito.

### Pontos de chamada e semântica "estrita" por rota

| Rota | Onde audita | Efeito se o log falhar |
|---|---|---|
| `POST /api/auth/login` | Antes de responder, tanto sucesso quanto falha de credencial | Se o log não gravar, responde `500` em vez do `200`/`401` normal — **login fica indisponível se o banco de auditoria estiver fora do ar** (trade-off aceito pelo usuário) |
| `POST /api/auth/logout` | Ao limpar o cookie | Mesma regra — `500` se o log falhar |
| `POST /api/specs` (create/update) | Dentro da **mesma transação** (`db.transaction`) do `saveSpec` | Se o log falhar, a transação inteira dá rollback — a spec não é salva |
| `DELETE /api/specs/[slug]` | Dentro da mesma transação do `deleteSpec` | Rollback também — spec não é removida se o log falhar |
| `POST /api/proxy` | Depois da requisição de saída já ter acontecido (não dá pra desfazer uma chamada HTTP externa) | Se o log falhar, a resposta ao usuário vira `500` em vez do resultado do proxy — a chamada externa já ocorreu, mas o cliente não recebe o resultado sem o rastro de auditoria gravado |

`lib/specs-store.ts` ganha uma pequena mudança: `saveSpec`/`deleteSpec` passam a aceitar um `tx` opcional (ou uma variante que já embrulha `db.transaction` internamente) pra permitir compor com o insert de auditoria atomicamente.

## Parte 3 — Retenção de 1 ano (via Coolify, não cron no app)

Novo script `scripts/audit-cleanup.mjs`, no mesmo padrão de `scripts/migrate.mjs` (usa só `postgres`/`drizzle-orm`, sem depender de devDependencies):

```js
// DELETE FROM audit_logs WHERE created_at < now() - interval '1 year'
```

**Configuração fora do repositório** (documentada no `README.md`, não é código): no Coolify, criar uma *Scheduled Task* pra este app com comando `node scripts/audit-cleanup.mjs` e cron `0 3 * * *` (diário, 03:00) — Coolify executa isso dentro do container já rodando, então tem acesso direto ao `DATABASE_URL` do ambiente sem precisar expor nenhum endpoint HTTP novo nem gerenciar segredo adicional.

## Parte 4 — CI (GitHub Actions, sem CD)

Novo `.github/workflows/ci.yml`, disparado em `push`/`pull_request` pra `main`:

| Job | Passos | Precisa de Postgres? |
|---|---|---|
| `lint-and-typecheck` | `npm ci`, `npm run lint`, `tsc --noEmit` | Não |
| `unit-tests` | `npm ci`, `npm test` | Não |
| `integration-tests` | serviço `postgres:16`, `npm ci`, `node scripts/migrate.mjs`, `npm run test:integration` | Sim (service container) |
| `build` | `npm ci`, `npm run build` | Não |

Sem job de build/push de imagem Docker nem deploy — confirmado como fora de escopo.

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `package.json` | + devDeps (eslint, eslint-config-next, typescript-eslint, vitest) + scripts `lint` (já existe), `test`, `test:integration` |
| `eslint.config.mjs` | novo |
| `lib/db/schema.ts` | + tabela `auditLogs` |
| `drizzle/000X_*.sql` | nova migração (gerada, não escrita à mão) |
| `lib/audit.ts` | novo — `logAudit()` |
| `lib/specs-store.ts` | `saveSpec`/`deleteSpec` passam a suportar transação com o insert de auditoria |
| `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/specs/route.ts`, `app/api/specs/[slug]/route.ts`, `app/api/proxy/route.ts` | chamam `logAudit()` conforme a tabela da Parte 2 |
| `scripts/audit-cleanup.mjs` | novo |
| `vitest.config.ts`, `vitest.integration.config.ts` | novos |
| `lib/openapi/*.test.ts`, `lib/slug.test.ts`, `lib/auth.test.ts` | novos (unit) |
| `tests/integration/*.test.ts` | novos (specs-store, audit, route handlers) |
| `.github/workflows/ci.yml` | novo |
| `README.md` | + seção documentando a Scheduled Task do Coolify pra limpeza de auditoria |

## Verificação

1. `npm run lint` e `npx tsc --noEmit` passam limpos.
2. `npm test` (unit) passa sem precisar de `DATABASE_URL`.
3. Com um Postgres local/efêmero: `node scripts/migrate.mjs && npm run test:integration` passa, incluindo um teste que força falha de `logAudit` (ex: mockando o insert) e confirma que a transação da spec dá rollback e a rota de login/proxy responde `500`.
4. `node scripts/audit-cleanup.mjs` contra um banco de teste com linhas antigas (`created_at` > 1 ano) confirma que só essas são removidas.
5. Push numa branch/PR de teste confirma que os 4 jobs do `.github/workflows/ci.yml` rodam e passam no GitHub Actions.

## Status

Este documento é o **plano**, ainda não implementado. Nenhum dos arquivos/tabelas/scripts listados acima foi criado — é a próxima etapa, mediante aprovação.
