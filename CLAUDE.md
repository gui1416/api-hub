# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

API Hub — a Next.js app that turns any OpenAPI/Swagger spec (JSON or YAML, by URL) into an interactive documentation site with a built-in "try it" request runner. The whole app sits behind a single shared login. UI strings are in Portuguese (pt-BR).

## Commands

```bash
npm run dev      # start dev server (next dev)
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint .
```

There is no test suite configured in this repo.

Note: `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so `npm run build` will succeed even with type errors — run `tsc --noEmit` (or rely on editor diagnostics) if you need real type-checking signal.

### Required env vars

Set in `.env` (see `.env.example`): `AUTH_USERNAME`, `AUTH_PASSWORD` (the single shared login), `JWT_SECRET` (signs the session JWT), and `DATABASE_URL` (Postgres connection string for the specs registry). Without these, login, every middleware-protected route, and any `/docs` page fail.

### Database (specs registry)

Postgres via Drizzle ORM (`drizzle-orm/postgres-js`). Schema lives in `lib/db/schema.ts` (single `specs` table), the connection singleton in `lib/db/client.ts` (cached on `globalThis` so dev hot-reload doesn't open a new pool per edit). `drizzle.config.ts` drives the CLI:

```bash
npx drizzle-kit generate   # create a new SQL migration from schema.ts changes
npx drizzle-kit migrate    # apply pending migrations to DATABASE_URL
npx drizzle-kit studio     # browse the DB
```

## Architecture

### Auth gate

`middleware.ts` guards `/`, `/docs/:path*`, `/api/spec/:path*`, `/api/specs/:path*`, and `/api/proxy/:path*`. It checks the `apihub_session` cookie (`lib/auth.ts`, a JWT signed with `JWT_SECRET` via `jose`); API routes get a 401 JSON response, pages get redirected to `/login?next=<path>`. `app/api/auth/login/route.ts` validates credentials against `AUTH_USERNAME`/`AUTH_PASSWORD` (constant-time compare) and sets the session cookie; `app/api/auth/logout/route.ts` clears it. There's one shared account for the whole instance — no per-user data model.

### Multi-spec support: registry + slugs

The app no longer renders a single fixed spec. `lib/specs-store.ts` persists registered specs as rows in the `specs` Postgres table (`{ slug, sourceUrl, title, description, version, createdAt, updatedAt }`, see `lib/db/schema.ts`), keyed by `sourceUrl` (unique). `lib/slug.ts#slugify` derives the slug from the spec title at creation time only — once assigned, a slug never changes even if the title changes later, since it backs the bookmarkable `/docs/[slug]` URL.

- `app/docs/page.tsx` renders `ApiHub` with the bundled default spec (`lib/openapi/api-hub-spec.ts`).
- `app/docs/[slug]/page.tsx` is a server component: looks up the slug via `getSpec`, fetches the raw spec server-side via `fetchSpec`, and 404s (`notFound()`) if the slug or fetch fails. It then re-extracts `{ title, description, version }` (`lib/openapi/spec-info.ts#extractSpecInfo`) and calls `saveSpec` again — so every time the docs are regenerated for an existing slug, the stored metadata is synced if the upstream spec's `info` changed. It passes `initialRawSpec`/`initialSourceUrl` into `ApiHub`.
- Loading a new URL from the UI (`ApiHub#loadSpec` in `components/api-hub/api-hub.tsx`) calls `GET /api/spec?url=...` to fetch+validate, extracts info client-side via `extractSpecInfo`, then `POST /api/specs` to upsert it via `saveSpec` (`lib/specs-store.ts`), then `router.push`es to `/docs/{slug}`. `saveSpec` matches existing rows by `sourceUrl`: if found and `title`/`description`/`version` are unchanged it's a no-op, if changed it updates in place (keeping the same slug), and only inserts a new row (with a freshly slugified, dedup-suffixed slug) when the URL hasn't been seen before.

### Data flow: spec in → parsed model → UI

1. **Input** — a raw OpenAPI/Swagger document, either the bundled `lib/openapi/api-hub-spec.ts` (default) or fetched from a registered slug's `sourceUrl`. `lib/openapi/fetch-spec.ts#fetchSpec(url)` is the shared fetch+validate logic: restricts to `http(s)`, auto-detects JSON vs YAML (via `js-yaml`, falling back to YAML if JSON parsing fails), and checks for an `openapi`/`swagger` key. It's called both from `GET /app/api/spec/route.ts` (client-side "load by URL" flow) and directly from `app/docs/[slug]/page.tsx` (server-side render of a registered spec).
2. **Parsing** — `lib/openapi/parser.ts#parseOpenAPI(doc)` is the single entry point that turns a raw spec object into a `ParsedSpec` (see `lib/openapi/types.ts`). It walks `paths`, dereferences local `$ref`s (`resolveRef`/`resolveSchema`, with cycle protection via a `seen` set and a depth cap), normalizes parameters/request bodies/responses, and groups operations into `TagGroup[]` ordered by the spec's declared `tags` array. Everything downstream of this function works with `ParsedSpec`/`ParsedOperation`, never the raw spec.
3. **State** — `components/api-hub/api-hub.tsx` is the top-level client component owning all state: the raw spec (seeded from `initialRawSpec` or the bundled default), the currently selected operation id, mobile nav, loading/error state for remote spec loads. It re-derives `ParsedSpec` via `useMemo(() => parseOpenAPI(rawSpec), [rawSpec])` — there's no separate store. Note it does not currently react to `initialRawSpec` changing after mount; navigating between specs relies on the page component remounting it (e.g. via a `key` prop keyed on slug).
4. **Rendering** — `Sidebar` (tag/operation nav) and either `Overview` (no operation selected) or `EndpointView` (operation selected) render off the derived `ParsedSpec`. `EndpointView` composes `ParamTable`, `SchemaView`, `CodePanel`/`CodeBlock`, and `TryIt`.

### Try-it / proxy flow

`TryIt` (`components/api-hub/try-it.tsx`) builds a request from user-filled path/query/header params and an editable JSON body (seeded from `lib/openapi/example.ts#exampleFromSchema`, which synthesizes example values straight from a JSON Schema). It never calls the target API directly — it POSTs `{ method, url, headers, body }` to `app/api/proxy/route.ts`, which performs the actual server-side fetch (to avoid browser CORS) and returns status/headers/body/timing. `app/api/spec`, `app/api/specs`, and `app/api/proxy` all restrict targets to `http(s)` and run on `runtime = 'nodejs'`.

### Code samples

`lib/openapi/code-samples.ts` generates copy-pasteable request snippets (curl, JS fetch, etc.) for a `ParsedOperation`, rendered via `CodePanel`/`CodeBlock`. `lib/openapi/json-highlight` (component) handles syntax highlighting for JSON display.

### Styling

Tailwind v4 with CSS-first theming (`@theme inline` block in `app/globals.css`) — no `tailwind.config.*` file. Custom design tokens of note: `--brand`/`--brand-foreground` and per-HTTP-method colors `--method-get|post|put|patch|delete` (consumed as `text-method-post`, `bg-method-delete/10`, etc.), each defined separately for light and dark mode. Dark mode is toggled by adding/removing the `.dark` class on `<html>`, driven by `localStorage['apihub-theme']` and applied pre-hydration via an inline script in `app/layout.tsx` to avoid flash-of-wrong-theme.

`components/ui/` holds shadcn-managed primitives (`components.json` config: style `base-nova`, base color `neutral`, icon library `lucide`) — generate/update these with the `shadcn` CLI rather than hand-rolling. `components/api-hub/` holds the app-specific components and is hand-written.

### Path aliases

`@/*` maps to the repo root (see `tsconfig.json`), e.g. `@/lib/openapi/parser`, `@/components/api-hub/header`.
