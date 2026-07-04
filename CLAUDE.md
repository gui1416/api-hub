# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

API Hub — a Next.js app that turns any OpenAPI/Swagger spec (JSON or YAML, by URL) into an interactive documentation site with a built-in "try it" request runner and an AI chat assistant over the loaded specs. The app is multi-user: accounts live in Postgres, access is controlled by RBAC (user → group(s) → permission(s)), and admins manage users/groups/permissions, AI providers, and a token-usage dashboard from dedicated screens. UI strings are in Portuguese (pt-BR).

## Commands

```bash
npm run dev                 # start dev server (next dev)
npm run build               # production build
npm run start               # run production build (note: next.config.mjs uses output: standalone — in containers run node .next/standalone/server.js)
npm run lint                # eslint .
npm test                    # unit tests (Vitest, no DB required)
npm run test:integration    # integration tests (Vitest, needs DATABASE_URL against a migrated Postgres)
npm run seed:admin          # one-time bootstrap of the first admin user (see Auth below)
```

Unit tests live next to their source file (`foo.test.ts` beside `foo.ts`), config in `vitest.config.ts`. Integration tests live in `tests/integration/*.test.ts` (config `vitest.integration.config.ts`), run against a real Postgres (no mocking Drizzle) with route handlers invoked directly as functions (e.g. `POST(new Request(...))`).

**Integration tests are destructive** — they `DELETE` from `users`, `specs`, `audit_logs`, and `ai_conversations`. Never run them with `DATABASE_URL` pointing at the real database. `scripts/_run-integration.sh` is the safe local runner: it creates/uses a disposable `apihub_test` database on the same Postgres server, migrates it, and runs the suite against it.

Note: `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so `npm run build` will succeed even with type errors — run `tsc --noEmit` (or rely on editor diagnostics) if you need real type-checking signal.

There is currently no CI workflow in the repo (no `.github/` directory) — lint/tests/build are run manually.

### Required env vars

Set in `.env` (see `.env.example`): `JWT_SECRET` (signs the session JWT) and `DATABASE_URL` (Postgres for users/RBAC, specs registry, AI config, and audit log) are required at runtime. `AUTH_USERNAME`/`AUTH_PASSWORD` are **only** read by `npm run seed:admin` to create the first admin — after the seed they can be removed; the login route never reads them. AI chat additionally uses `AI_CONFIG_ENCRYPTION_KEY` (32 bytes base64, encrypts provider API keys at rest) and optional `AI_RATE_LIMIT_TOKENS_PER_HOUR`/`AI_RATE_LIMIT_TOKENS_PER_DAY`.

Beware: the `.env` on this machine has CRLF line endings — anything that loads it via `source .env` gets a trailing `\r` on each value. Scripts that consume these values must `trim()` them (`scripts/seed-admin.mjs` does).

### Database

Postgres via Drizzle ORM (`drizzle-orm/postgres-js`). Schema lives in `lib/db/schema.ts`:

- **`users`** — `{ id, username, name, email (unique, nullable in DB but required by the API), phone, company, jobTitle, passwordHash (bcrypt), status: active|disabled, mustChangePassword, lastLoginAt, lastLogoutAt }`. `lastLoginAt`/`lastLogoutAt` derive the "online" badge (`lib/auth.ts#isOnline`) — no session/presence table. Profile fields (name/email required; phone/company/jobTitle optional) were added in migration `0004` (name backfilled from username).
- **`groups`** / **`permissions`** / **`group_permissions`** / **`user_groups`** — RBAC. The permission catalog is data, editable from the UI; migrations `0003`+`0004` seed 9 permissions — screens (`admin.users`, `admin.groups`, `admin.ai`, `admin.dashboard`, `docs.view`) and actions (`specs.load`, `specs.delete`, `proxy.use`, `chat.use`) — and two `isSystem` groups (`Administradores` with everything, `Usuários` with `docs.view`+`chat.use`+`proxy.use` — the default for new users). `isSystem` groups can't be deleted; the 9 seeded permission keys are protected in the API (`PROTECTED_KEYS`) because middleware/routes reference them by key. Migration `0004` split the old `specs.manage` into `specs.load`+`specs.delete` (grants migrated) and granted `proxy.use` to groups that had `docs.view`.
- **`group_specs`** + **`groups.allSpecs`** + **`groups.hubDocs`** — per-spec ACL. A group with `allSpecs=true` (default) sees every spec; with `false`, only the slugs listed in `group_specs`. The bundled default doc (`/docs`) is a pseudo-spec in the same ACL via the `hubDocs` flag (no row in `specs`): `allSpecs=true` includes it, otherwise `hubDocs` decides. A user's effective spec set is the union across their groups (`lib/spec-access.ts#getAllowedSpecSlugs` / `canAccessHubDocs`; any `allSpecs` group ⇒ all). Enforced in `GET /api/specs` (filtered list), `/docs/[slug]` and `/docs` (404), and the AI chat routes (conversations + @mentions, via `canAccessSpecSource`) — deliberately not in the middleware. `UserAccess.hubDocs`/`/api/me` expose the flag so the palette hides the "Documentação do API Hub" item.
- **`specs`** — registered specs, keyed by `sourceUrl` (unique); slug derived from title at creation via `lib/slug.ts#slugify` and immutable afterwards (backs `/docs/[slug]`).
- **`audit_logs`** — see Audit below.
- **`ai_providers`**, **`ai_conversations`**, **`ai_messages`**, **`ai_settings`** — AI chat. `ai_conversations.userId` is nullable with `ON DELETE SET NULL`: deleting a user keeps their conversations/usage (shown as "Usuário removido" in the dashboard). `ai_settings` is a singleton row (id=1) holding `systemPromptRules`.

Connection singleton in `lib/db/client.ts` (cached on `globalThis`). `drizzle.config.ts` drives the CLI (`npx drizzle-kit generate | migrate | studio`).

### Audit log

`lib/audit.ts#logAudit()` writes one row per sensitive action to `audit_logs`. Actions cover auth (`auth.login`, `auth.logout`), specs (`spec.created|updated|deleted`), proxy (`proxy.request` — metadata is `{ method, url, status, durationMs }`, deliberately never headers/bodies), AI config (`ai.config_updated`), and the admin mutations (`user.created|updated|activated|deactivated|deleted|password_reset|password_changed|groups_updated`, `group.created|updated|deleted|permissions_updated|specs_updated`, `permission.created|deleted`). `actor` is the acting **username** (or `'anonymous'`).

Audit logging is **strict**: if the insert fails, `logAudit` throws and the route responds `500` instead of completing the action. Store/admin mutations wrap the change and `logAudit` in the same `db.transaction` so a failed audit insert rolls the mutation back (`lib/db/client.ts`'s `DbOrTx` type is how helpers accept either the db or an in-flight tx).

Retention is 1 year, enforced by `scripts/audit-cleanup.mjs` run out-of-band via a Coolify Scheduled Task (`0 3 * * *`) — not a cron inside the app. See README.md.

## Architecture

### Auth: users, sessions, forced logout

- `app/api/auth/login/route.ts` looks the user up in `users`, verifies with bcrypt (`lib/passwords.ts`; a dummy-hash compare masks username enumeration timing), rejects `disabled` users with 403, stamps `lastLoginAt`, and issues the session JWT. Every attempt is audited, including credential-less ones (actor `'anonymous'`).
- The JWT (`lib/auth.ts`, cookie `apihub_session`, 1 day) carries `{ sub: userId, username, mustChangePassword }`. `getSessionFromRequest` reads it straight off the `Cookie` header so handlers can be invoked directly in tests.
- `app/api/auth/logout/route.ts` stamps `lastLogoutAt` (feeds `isOnline`).
- Password reset (`POST /api/admin/users/:id/reset-password`) generates a temporary password returned **once** in the response, sets `mustChangePassword`; `POST /api/auth/change-password` verifies the current password, clears the flag, and **re-issues the cookie** so the change takes effect immediately. `app/change-password/page.tsx` is the forced-change screen.
- Forced logout paths: the middleware re-checks the user in the DB on every request (a disabled/deleted user's next request gets 401/redirect and the cookie cleared), and `components/session-provider.tsx` (mounted in `app/layout.tsx`) polls `/api/me` every 45s to kick dead sessions to `/login` without waiting for navigation.

### Middleware: auth gate + RBAC (runtime nodejs)

`middleware.ts` runs with `runtime = 'nodejs'` so it can query Postgres directly (Next 16.2 warns the file convention is being renamed to `proxy.ts` — deprecation only). Per request it: verifies the JWT → loads status + effective permissions in one query (`lib/rbac.ts#getUserAccess`, joining users → user_groups → groups → group_permissions → permissions) → rejects disabled users → enforces the `mustChangePassword` detour → matches the route against `lib/rbac.ts#requiredPermissionFor` (segment-aware prefix map; e.g. `/admin/users` → `admin.users`, `/docs` → `docs.view`, `/api/ai` → `chat.use`, `POST /api/specs` + `/api/spec` → `specs.load`, `DELETE /api/specs/[slug]` → `specs.delete`, `/api/proxy` → `proxy.use`, while `GET /api/specs` stays auth-only) → 403 JSON for APIs / redirect to `/?denied=1` for pages → finally **overwrites** `x-user-id`/`x-user-name`/`x-user-groups`/`x-user-permissions` request headers (never trusting client values) so downstream routes read identity via `lib/request-identity.ts#getRequestUser` without a second query (it falls back to cookie+DB when the headers are absent, e.g. handlers called directly in tests).

`GET /api/me` returns `{ id, username, mustChangePassword, groups, permissions }` — UI convenience (command palette gating, session watcher); real enforcement is always the middleware.

### App shell: global header + global command palette

- `components/command-palette/command-palette-provider.tsx` is mounted in `app/layout.tsx` (inside `SessionProvider`): global Cmd+K listener + `useCommandPalette()` hook, disabled on `/login` and `/change-password`. It renders `components/command-palette/command-palette.tsx` (successor of the old `spec-switcher.tsx`): registered specs (list already ACL-filtered by `GET /api/specs`, group gated by `docs.view`), a fixed "Documentação do API Hub" item that navigates to `/docs` (the bundled default spec behaves like a spec entry), load-new-URL (gated `specs.load`, `loadSpec` logic lives here now), per-spec delete (gated `specs.delete`), the "Assistente" group (only while a docs page is mounted — `ApiHub` registers `{ sourceUrl, openAiChat }` via `setDocsContext`), and the "Administração" items filtered by permissions.
- `components/app-shell/app-header.tsx` is the shared header (brand → `/`, screen title, ⌘K button, theme, logout) used by the home page, `app/admin/layout.tsx`, and `app/config-ia/layout.tsx`; `/docs` keeps its own `Header` (mobile sidebar + spec title) which opens the same global palette. The home CTAs (`components/app-shell/open-docs-button.tsx`) open the palette instead of navigating to `/docs`.

### Admin screens

All reachable from the global command palette (Cmd+K), items filtered by the permissions from `useSession()` (`components/session-provider.tsx`):

- **`/admin/users` and `/admin/groups`** both render the same AD-style directory console (`components/admin/directory-console.tsx`, data from `lib/admin/directory-data.ts#loadDirectoryData`, tree nodes filtered by session permissions) with different initial containers. Left tree: Usuários / Grupos / Permissões; right pane: searchable object list; double-click (or the row's kebab menu) opens a "Propriedades" dialog with tabs:
  - **User properties** — Geral (profile: name/email required, phone/company/jobTitle optional), Conta (username read-only, active switch, reset password, delete, last login/logout), Membro de (group membership). Saved via `PATCH /api/admin/users/:id` (profile+groups in one call, audits `user.updated`/`user.groups_updated`). Delete safeguards live in the route (`app/api/admin/users/[id]/route.ts`): no self-deletion, never remove/disable the last **active** member of `Administradores`.
  - **Group properties** — Geral (name/description; `isSystem` blocks delete), Membros (`PUT /api/admin/groups/:id/members` replaces the set, audits `group.members_updated`, refuses to leave `Administradores` without an active member), Permissões (matrix in "Telas (rotas)" / "Ações" / "Personalizadas" sections, categorized client-side by key → `PUT .../permissions`), Specs ("Todas as specs" toggle + multi-select, including the "Documentação do API Hub" pseudo-spec → `PUT .../specs` with `{ allSpecs, hubDocs, specSlugs }`, audits `group.specs_updated`).
  - **Permissions container** — the catalog (create with key slugified from the name; seeded keys undeletable).
- **`/admin/dashboard`** (`components/admin/usage-dashboard.tsx`) — token usage from `ai_messages` aggregated by provider label, model, and user (`GET /api/admin/dashboard/usage?range=24h|7d|30d`); orphaned conversations aggregate as "Usuário removido".
- **`/config-ia`** — AI provider list; clicking a saved provider row opens a usage report sheet (`components/config-ia/provider-usage-sheet.tsx` → `GET /api/config-ia/providers/:id/usage?range=…`: totals, tokens/day chart, by model, by user, health/cooldown; historical linkage is by `providerLabel` text, so renaming a provider detaches its old history). Plus the global "Regras e limitações da IA" textarea (`components/config-ia/ai-rules-form.tsx` → `PUT /api/config-ia/settings` → `ai_settings.systemPromptRules`).

DB-backed server-component pages (`/admin/users`, `/admin/groups`, `/config-ia`) export `dynamic = 'force-dynamic'` — without it Next prerenders them statically at build time and `router.refresh()` serves stale data.

### Multi-spec support: registry + slugs

- `app/docs/page.tsx` renders `ApiHub` with the bundled default spec (`lib/openapi/api-hub-spec.ts`); it appears in the command palette as the fixed "Documentação do API Hub" entry (the home CTAs open the palette instead of navigating).
- `app/docs/[slug]/page.tsx` is a server component: looks up the slug via `getSpec`, enforces the per-spec ACL via `canAccessSpec` reading `x-user-id` from `headers()` (404 when denied), fetches the raw spec server-side via `fetchSpec`, 404s if either fails, re-syncs stored `{ title, description, version }` via `saveSpec`, and passes `initialRawSpec`/`initialSourceUrl` into `ApiHub`.
- Loading a new URL happens in the command palette (`components/command-palette/command-palette.tsx#loadSpec`): `GET /api/spec?url=...` then `POST /api/specs` (both gated by `specs.load`), then routes to `/docs/{slug}`. `saveSpec` matches rows by `sourceUrl`: no-op if metadata unchanged, in-place update (same slug) if changed, insert with a fresh dedup-suffixed slug only for new URLs.

### Data flow: spec in → parsed model → UI

1. **Input** — `lib/openapi/fetch-spec.ts#fetchSpec(url)`: restricts to `http(s)`, auto-detects JSON vs YAML (`js-yaml`), checks for an `openapi`/`swagger` key.
2. **Parsing** — `lib/openapi/parser.ts#parseOpenAPI(doc)` turns a raw spec into a `ParsedSpec` (`lib/openapi/types.ts`): walks `paths`, dereferences local `$ref`s with cycle protection, normalizes params/bodies/responses, groups operations into `TagGroup[]`. Everything downstream works with `ParsedSpec`, never the raw spec.
3. **State** — `components/api-hub/api-hub.tsx` owns all client state and derives `ParsedSpec` via `useMemo`. It does not react to `initialRawSpec` changing after mount; navigation between specs relies on the page remounting it via a `key` prop.
4. **Rendering** — `Sidebar` + `Overview`/`EndpointView` (composing `ParamTable`, `SchemaView`, `CodePanel`/`CodeBlock`, `TryIt`).

### Try-it / proxy flow

`TryIt` never calls the target API directly — it POSTs `{ method, url, headers, body }` to `app/api/proxy/route.ts`, which performs the server-side fetch (avoiding CORS) and returns status/headers/body/timing. `app/api/spec`, `app/api/specs`, and `app/api/proxy` restrict targets to `http(s)` and run on `runtime = 'nodejs'`.

### AI chat

- Opened from the command palette (or Ctrl+I) on a registered spec — `components/api-hub/ai-chat-dialog.tsx`.
- **Conversations are per-user**: `/api/ai/conversations*` routes filter by `ai_conversations.userId` (owner mismatch returns 404, not 403, to avoid leaking existence).
- The system prompt (`app/api/ai/conversations/[id]/messages/route.ts`) is composed of: fixed base text + `ai_settings.systemPromptRules` (admin-set) + `lib/ai/context.ts#buildUserContext` (derived from the requester's username/groups/permissions — deliberately no free-text field, so no user can inject arbitrary prompt content) + JSON spec summaries (`summarizeSpec`, from a 5-min in-memory cache in `lib/ai/context.ts`).
- Providers (`ai_providers`, keys encrypted AES-256-GCM via `lib/ai/crypto.ts`) are tried in priority order with fallback + circuit breaker (`lib/ai/provider-client.ts`: 401/403 → 15min cooldown, 429 → `Retry-After` or 5min). Token rate limits in `lib/ai/rate-limit.ts`.

### Styling

Tailwind v4 with CSS-first theming (`@theme inline` in `app/globals.css`) — no `tailwind.config.*`. Custom tokens: `--brand`/`--brand-foreground` and per-HTTP-method colors (`text-method-post`, `bg-method-delete/10`, etc.). Dark mode via the `.dark` class on `<html>`, driven by `localStorage['apihub-theme']` and applied pre-hydration in `app/layout.tsx`.

`components/ui/` holds shadcn-managed primitives (style `base-nova`, base color `neutral`, icons `lucide`) — generate/update with the `shadcn` CLI. `components/api-hub/`, `components/admin/`, and `components/config-ia/` are hand-written app components.

Known lint idiom: the repo has ~8 `react-hooks/set-state-in-effect` **warnings** (resync-from-server-props effects, e.g. `config-ia-manager.tsx`, `users-manager.tsx`) — this is the established pattern here, 0 errors; don't chase them.

### Path aliases

`@/*` maps to the repo root (see `tsconfig.json`), e.g. `@/lib/rbac`, `@/components/admin/users-manager`.
