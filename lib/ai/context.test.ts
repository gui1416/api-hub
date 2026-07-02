import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSpecContext, invalidateSpecCache, summarizeSpec } from './context'
import type { ParsedSpec } from '@/lib/openapi/types'

function fakeParsedSpec(): ParsedSpec {
  return {
    info: { title: 'RHiD API', version: '0.0.1', description: 'desc' },
    servers: [{ url: 'https://www.rhid.com.br' }],
    groups: [
      {
        name: 'Login',
        operations: [
          {
            id: 'post-login',
            method: 'post',
            path: '/login',
            summary: 'Create a token',
            tags: ['Login'],
            parameters: [],
            responses: [],
          },
        ],
      },
    ],
    operations: [
      {
        id: 'post-login',
        method: 'post',
        path: '/login',
        summary: 'Create a token',
        tags: ['Login'],
        parameters: [],
        responses: [],
      },
    ],
    securitySchemes: [],
    raw: {},
  }
}

function rawSpecDoc() {
  return {
    openapi: '3.0.0',
    info: { title: 'RHiD API', version: '0.0.1' },
    servers: [{ url: 'https://www.rhid.com.br' }],
    tags: [{ name: 'Login' }],
    paths: {
      '/login': {
        post: { tags: ['Login'], summary: 'Create a token', responses: {} },
      },
    },
  }
}

describe('summarizeSpec', () => {
  it('flattens a ParsedSpec into title/version/servers/endpoints', () => {
    const summary = summarizeSpec(fakeParsedSpec())
    expect(summary).toEqual({
      title: 'RHiD API',
      version: '0.0.1',
      servers: ['https://www.rhid.com.br'],
      endpoints: [
        { method: 'POST', path: '/login', summary: 'Create a token', tags: ['Login'] },
      ],
    })
  })

  it('falls back to "API" when there is no title', () => {
    const parsed = fakeParsedSpec()
    parsed.info = { version: '1.0.0' }
    expect(summarizeSpec(parsed).title).toBe('API')
  })
})

describe('getSpecContext / invalidateSpecCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // getSpecContext caches in a module-level singleton Map, so each test uses
  // its own unique sourceUrl to avoid leaking cache entries across tests.

  it('serves from cache within the TTL without calling fetchFn again', async () => {
    const fetchFn = vi.fn().mockResolvedValue(rawSpecDoc())
    const url = 'https://ttl-cache.example.com/openapi.json'

    const first = await getSpecContext(url, fetchFn)
    const second = await getSpecContext(url, fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
    expect(first.info.title).toBe('RHiD API')
  })

  it('re-fetches once the TTL has expired', async () => {
    const fetchFn = vi.fn().mockResolvedValue(rawSpecDoc())
    const url = 'https://ttl-expired.example.com/openapi.json'

    await getSpecContext(url, fetchFn)
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await getSpecContext(url, fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('does not re-fetch just before the TTL expires', async () => {
    const fetchFn = vi.fn().mockResolvedValue(rawSpecDoc())
    const url = 'https://ttl-not-yet-expired.example.com/openapi.json'

    await getSpecContext(url, fetchFn)
    vi.advanceTimersByTime(5 * 60 * 1000 - 1)
    await getSpecContext(url, fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('forces a new fetch after invalidateSpecCache', async () => {
    const fetchFn = vi.fn().mockResolvedValue(rawSpecDoc())
    const url = 'https://invalidate.example.com/openapi.json'

    await getSpecContext(url, fetchFn)
    invalidateSpecCache(url)
    await getSpecContext(url, fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('keeps separate cache entries per sourceUrl', async () => {
    const fetchFn = vi.fn().mockResolvedValue(rawSpecDoc())

    await getSpecContext('https://a.example.com/openapi.json', fetchFn)
    await getSpecContext('https://b.example.com/openapi.json', fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
