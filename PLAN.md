# Plano v2: header global, palette global, perfil de usuário, RBAC macro/micro + ACL por spec, relatório por provider

## Status do plano v1 (multi-usuário, grupos/permissões, dashboard) — concluído

A revisão do código confirmou que tudo do plano anterior foi implementado:

- Usuários em Postgres com bcrypt, seed do primeiro admin (`scripts/seed-admin.mjs`),
  troca forçada de senha (`/change-password`), reset com senha temporária exibida uma vez.
- RBAC usuário → grupo(s) → permissão(ões) com catálogo editável (`lib/rbac.ts`),
  migration `0003` seedando 7 permissões e os grupos `Administradores`/`Usuários`
  (`isSystem`).
- `middleware.ts` em runtime nodejs: checagem fresca de status + permissões a cada
  request, headers `x-user-*` sobrescritos (não spoofáveis), logout forçado
  (usuário desativado/removido cai na request seguinte + poll de 45s em
  `components/session-provider.tsx`).
- Telas `/admin/users`, `/admin/groups`, `/admin/dashboard` e regras de IA em
  `/config-ia` (`ai_settings.systemPromptRules`), contexto por usuário derivado
  (`lib/ai/context.ts#buildUserContext`), conversas de IA isoladas por usuário.
- Auditoria strict em transação para todas as mutações administrativas.
- Testes unitários (`lib/rbac.test.ts`, `lib/auth.test.ts`) e de integração
  (`tests/integration/`, runner seguro `scripts/_run-integration.sh`).

## Lacunas encontradas na revisão (que este plano v2 fecha)

1. **Header não está em todas as telas** — só `/docs` e a home têm header;
   `/admin/*`, `/config-ia` e `/change-password` renderizam conteúdo sem
   header/navegação de volta.
2. **Command palette não é global** — `SpecSwitcher` só é montado dentro de
   `components/api-hub/api-hub.tsx`; Cmd+K não funciona em `/`, `/admin/*`,
   `/config-ia`.
3. **Cadastro de usuário só tem username + grupos** — faltam name, email,
   telefone, empresa, cargo.
4. **Permissões com granularidade grossa** — `specs.manage` cobre carregar E
   deletar juntos; `/api/proxy` exige só autenticação; a matriz em `/admin/groups`
   é plana (sem separação telas/ações); não há controle por spec individual.
5. **Provider em `/config-ia` não é clicável** — só latência média/nº de chamadas
   agregados.
6. **Home navega para `/docs?switcher=1`** em vez de abrir o palette na hora, e o
   `/docs` (spec padrão bundled) não aparece como spec dentro do command.

## Decisões já tomadas com o usuário

- RBAC controla telas + ações **e também acesso por spec individual** (ACL
  grupo × spec).
- Relatório do provider abre em **painel/sheet lateral** dentro de `/config-ia`.
- Campos obrigatórios do usuário: **username, name e email** (email único);
  telefone, empresa e cargo opcionais.

---

## 1. Migration 0004 (schema + dados)

`lib/db/schema.ts` + `npx drizzle-kit generate`, com SQL de seed/backfill editado no
arquivo gerado (mesmo padrão da `0003`):

- **`users`** — novas colunas:
  - `name text` — backfill com o valor de `username`, depois `NOT NULL`;
  - `email text` — nullable no banco (linhas antigas não têm), mas obrigatório e
    único na API; unique index (Postgres permite múltiplos `NULL`);
  - `phone text`, `company text`, `jobTitle text` (`job_title`) — nullable.
- **`groups`** — nova coluna `allSpecs boolean NOT NULL DEFAULT true`. Semântica
  sem efeito colateral entre grupos: `allSpecs=true` ⇒ o grupo vê todas as specs;
  `false` ⇒ só as listadas em `group_specs`. Acesso efetivo do usuário = união dos
  grupos (qualquer grupo com `allSpecs` ⇒ todas).
- **`group_specs`** — `{ groupId FK groups cascade, specSlug FK specs.slug cascade }`,
  PK composta — ACL por spec.
- **Permissões (dados)** — inserir `specs.load` (carregar/registrar spec),
  `specs.delete` (remover spec) e `proxy.use` (testar endpoint). Migrar grants:
  grupos com `specs.manage` ganham `specs.load` + `specs.delete`; grupos com
  `docs.view` ganham `proxy.use` (preserva o comportamento atual do try-it);
  apagar `specs.manage`. Atualizar `PROTECTED_KEYS` em
  `app/api/admin/permissions/route.ts` para o novo conjunto de 9 chaves.

## 2. RBAC macro/micro (`lib/rbac.ts` + tela de grupos)

- `ROUTE_PERMISSIONS`: `POST /api/specs` e `/api/spec` → `specs.load`;
  `DELETE /api/specs/[slug]` → `specs.delete`; `/api/proxy` → `proxy.use`
  (demais entradas inalteradas).
- **`/admin/groups`** (`components/admin/groups-manager.tsx`): matriz reorganizada
  em seções — **"Telas (rotas)"** (`docs.view`, `admin.users`, `admin.groups`,
  `admin.ai`, `admin.dashboard`), **"Ações"** (`specs.load`, `specs.delete`,
  `proxy.use`, `chat.use`) e **"Personalizadas"** (criadas via UI). A
  categorização é derivada da chave no client (mapa fixo das 9 seedadas) — sem
  coluna nova no banco.
- **Acesso a specs por grupo** (mesma tela): toggle "Todas as specs" (`allSpecs`)
  e, quando desligado, multi-select das specs registradas. Nova rota
  `PUT /api/admin/groups/:id/specs` (substitui o conjunto inteiro, mesmo padrão de
  `.../permissions`), audita `group.specs_updated`.
- **Enforcement por spec** — novo `lib/spec-access.ts` com
  `getAllowedSpecSlugs(userId)` / `canAccessSpec(userId, slug)` (query
  `user_groups → groups.allSpecs / group_specs`). Aplicado em:
  - `GET /api/specs` — filtra a lista (o palette passa a mostrar só o permitido);
  - `app/docs/[slug]/page.tsx` — 404 se não permitido;
  - rotas de chat (`/api/ai/conversations*`) — a conversa referencia
    `specSourceUrl`; resolver o slug e checar acesso.
  - Deliberadamente fora do middleware (exigiria query por slug a cada request);
    a checagem fica nas rotas/páginas, que já leem identidade via
    `lib/request-identity.ts`.
- Gating na UI: "Carregar nova URL" ⇒ `specs.load`; lixeira de spec ⇒
  `specs.delete`; `TryIt` escondido sem `proxy.use` (via `useSession()`).

## 3. Cadastro de usuário com perfil completo

- `POST /api/admin/users`: aceita/valida `name` (obrigatório), `email`
  (obrigatório, formato + unicidade → 409), `phone`/`company`/`jobTitle` opcionais.
- `PATCH /api/admin/users/:id`: passa a aceitar os campos de perfil; nova ação de
  auditoria `user.updated`.
- `components/admin/users-manager.tsx`: dialogs de criação/edição com os 6 campos;
  a tabela mostra name + email (demais campos no dialog de edição).
- `GET /api/me` e `lib/ai/context.ts#buildUserContext` passam a incluir `name`
  (e cargo/empresa no contexto da IA quando preenchidos — enriquece o contexto
  sem reintroduzir campo de texto livre).

## 4. Header global em todas as telas

- Novo `components/app-shell/app-header.tsx` (client): marca API Hub (link `/`),
  título da tela, botão de busca/⌘K que abre o palette global e logout — mesmo
  visual do header atual do docs.
- `app/admin/layout.tsx` (novo) renderiza o header para todo `/admin/*`;
  `/config-ia` usa o mesmo header; a home troca o header inline por ele. `/docs`
  mantém o `Header` do ApiHub (ganha só o hook do palette global). `/login` e
  `/change-password` ficam sem palette (fluxos bloqueados); o change-password
  ganha header mínimo sem navegação.

## 5. Command palette global

- Novo `components/command-palette/command-palette-provider.tsx` montado em
  `app/layout.tsx` (dentro do `SessionProvider`): estado aberto/fechado, listener
  global de Cmd+K (inativo em `/login` e `/change-password`) e hook
  `useCommandPalette()`.
- `SpecSwitcher` migra para dentro do provider (vira `command-palette.tsx`),
  levando junto a lógica `loadSpec` de `api-hub.tsx` (fetch `/api/spec` →
  `POST /api/specs` → `router.push`). O `ApiHub` registra contexto no provider
  (sourceUrl, abrir chat IA) para o grupo "Assistente" continuar aparecendo só no
  docs; Ctrl+I continua como está.
- Grupo "Specs registradas" só aparece com `docs.view` e ganha um item fixo
  **"Documentação do API Hub"** (a spec padrão bundled) que navega para `/docs` —
  o `/docs` passa a se comportar como uma spec dentro do command.
- Visibilidade dos itens segue derivada de `useSession().me.permissions`
  (a garantia real continua sendo o middleware).

## 6. Home abre o palette

Os dois CTAs ("Ir para a documentação" e "Acessar documentação") viram um client
component que chama `useCommandPalette().open()` — sem navegação para
`/docs?switcher=1`. O suporte a `?switcher=1` em `app/docs/page.tsx` é removido.

## 7. Relatório de uso por provider em `/config-ia`

- Clicar na linha do provider abre um **Sheet lateral** (adicionar
  `components/ui/sheet.tsx` via shadcn CLI se ainda não existir).
- Nova rota `GET /api/config-ia/providers/:id/usage?range=24h|7d|30d` (o prefixo
  `/api/config-ia` já é gated por `admin.ai`): a partir de `ai_messages` filtrado
  pelo `providerLabel` do provider — totais (tokens prompt/completion, mensagens,
  latência média, nº de fallbacks), série por dia, quebra por modelo e por usuário
  (join `ai_conversations`/`users`; `null` ⇒ "Usuário removido"), mais saúde do
  provider (`failureCount`, `lastFailureAt`, `cooldownUntil`).
- Limitação documentada: o vínculo histórico é por `providerLabel` (texto) —
  renomear o provider desassocia o histórico antigo.
- Gráficos do sheet seguem a skill `dataviz`.

## 8. Auditoria

Novas ações na união de `lib/audit.ts`: `user.updated`, `group.specs_updated`.
Mesmo padrão strict (auditoria na mesma transação da mutação; falha no insert
reverte a mutação).

## 9. Testes

- Unit: `lib/rbac.test.ts` (novas chaves/rotas: `specs.load`/`specs.delete`,
  `proxy.use`), novo `lib/spec-access.test.ts` (allSpecs, união entre grupos,
  grupo restrito).
- Integração (`tests/integration/`): criação de usuário com email duplicado → 409
  e campos de perfil persistidos; `PUT .../groups/:id/specs` + filtro de
  `GET /api/specs` para grupo restrito; 404 de `/docs/[slug]` sem acesso; usage
  por provider agregando por dia/modelo/usuário.
- Atualizar asserts existentes que referenciam `specs.manage`.

## 10. Documentação

Atualizar `CLAUDE.md` e `README.md`: catálogo passa a 9 permissões seedadas, ACL
por spec, novos campos de usuário, palette global e header global.

## Ordem de implementação

1. Migration 0004 + schema + `PROTECTED_KEYS` + `lib/rbac.ts` + `lib/spec-access.ts`.
2. Rotas: users (POST/PATCH com perfil), groups (`PUT :id/specs`), specs/proxy
   (permissões novas), usage por provider, enforcement por spec em
   specs/docs/chat.
3. UI: header global + layout admin, palette global (provider + migração do
   SpecSwitcher + CTAs da home), users-manager (campos de perfil), groups-manager
   (seções macro/micro + acesso a specs), sheet de relatório do provider.
4. Auditoria, testes, docs.

## Verificação

- `npm run lint`, `npx tsc --noEmit`, `npm test`.
- `bash scripts/_run-integration.sh` (Postgres descartável `apihub_test` — nunca
  apontar `DATABASE_URL` de integração pro banco real).
- Manual: Cmd+K em `/`, `/admin/users`, `/config-ia`; CTA da home abrindo o
  palette; item "Documentação do API Hub" navegando para `/docs`; usuário de
  grupo restrito não vê spec fora da lista (palette, `/docs/[slug]` → 404, chat);
  usuário sem `proxy.use` sem o TryIt e `/api/proxy` → 403; criação de usuário
  exigindo name/email (email duplicado → erro); clique no provider abrindo o
  sheet com o relatório completo.
