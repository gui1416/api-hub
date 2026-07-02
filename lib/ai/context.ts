import { parseOpenAPI } from '@/lib/openapi/parser'
import type { ParsedSpec } from '@/lib/openapi/types'

export interface SpecSummaryEndpoint {
  method: string
  path: string
  summary?: string
  tags: string[]
}

export interface SpecSummary {
  title: string
  version?: string
  servers: string[]
  endpoints: SpecSummaryEndpoint[]
}

/**
 * Flattens a `ParsedSpec` into a compact, LLM-friendly summary: title,
 * version, server URLs, and a flat list of endpoints (method/path/summary/
 * tags) regardless of how the spec groups them by tag internally.
 */
export function summarizeSpec(parsed: ParsedSpec): SpecSummary {
  return {
    title: parsed.info.title ?? 'API',
    version: parsed.info.version,
    servers: parsed.servers.map((server) => server.url),
    endpoints: parsed.operations.map((operation) => ({
      method: operation.method.toUpperCase(),
      path: operation.path,
      summary: operation.summary,
      tags: operation.tags,
    })),
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  parsed: ParsedSpec
  fetchedAt: number
}

// Process-local, in-memory cache of parsed specs keyed by sourceUrl. This is
// just a performance cache (avoids re-fetching + re-parsing on every chat
// message), not an external resource like a DB connection pool, so — unlike
// lib/db/client.ts's globalThis-cached connection — there's no need to
// survive dev hot-reloads: a cold cache after an edit is harmless, it just
// refetches once.
const specCache = new Map<string, CacheEntry>()

/**
 * Returns the parsed spec for `sourceUrl`, serving from the in-memory cache
 * if it's still within the 5-minute TTL. Otherwise calls `fetchFn` to get the
 * raw spec document, parses it via `parseOpenAPI`, caches the result, and
 * returns it.
 *
 * `fetchFn` is caller-supplied (rather than this module calling
 * `fetchSpec` itself) so callers can reuse whatever raw-fetch they already
 * have in hand (e.g. `lib/openapi/fetch-spec.ts#fetchSpec`) without this
 * module needing to know about URL validation, content negotiation, etc.
 */
export async function getSpecContext(
  sourceUrl: string,
  fetchFn: () => Promise<unknown>,
): Promise<ParsedSpec> {
  const cached = specCache.get(sourceUrl)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.parsed
  }

  const raw = await fetchFn()
  const parsed = parseOpenAPI(raw as Record<string, unknown>)
  specCache.set(sourceUrl, { parsed, fetchedAt: Date.now() })
  return parsed
}

/**
 * Evicts `sourceUrl` from the parsed-spec cache, forcing the next
 * `getSpecContext` call to re-fetch and re-parse. Called by the "Atualizar
 * contexto" button in the chat and the "Reprocessar spec" button on the docs
 * page (both implemented in a later phase).
 */
export function invalidateSpecCache(sourceUrl: string): void {
  specCache.delete(sourceUrl)
}
