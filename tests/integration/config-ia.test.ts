import { eq } from 'drizzle-orm'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/audit')>()
  return { ...actual, logAudit: vi.fn(actual.logAudit) }
})

process.env.AI_CONFIG_ENCRYPTION_KEY ??= Buffer.alloc(32, 3).toString('base64')

import { logAudit } from '@/lib/audit'
import { decrypt } from '@/lib/ai/crypto'
import { db } from '@/lib/db/client'
import { aiProviders, auditLogs } from '@/lib/db/schema'
import { GET as configIaGet, PUT as configIaPut } from '@/app/api/config-ia/route'

const mockedLogAudit = vi.mocked(logAudit)

beforeEach(async () => {
  await db.delete(auditLogs)
  await db.delete(aiProviders)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function lastAuditRow() {
  const rows = await db.select().from(auditLogs)
  return rows.at(-1)
}

function putRequest(providers: unknown[]) {
  return new Request('http://test/api/config-ia', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ providers }),
  })
}

describe('GET /api/config-ia', () => {
  it('never returns apiKeyEncrypted or the real key, only apiKeyLast4', async () => {
    await db.insert(aiProviders).values({
      label: 'Groq',
      providerType: 'openai-compatible',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKeyEncrypted: 'iv:tag:cipher',
      apiKeyLast4: 'abcd',
      model: 'llama-3.1',
      priority: 1,
      enabled: true,
    })

    const res = await configIaGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.providers).toHaveLength(1)
    expect(body.providers[0].apiKeyLast4).toBe('abcd')
    expect(body.providers[0]).not.toHaveProperty('apiKeyEncrypted')
    expect(JSON.stringify(body)).not.toContain('iv:tag:cipher')
  })

  it('orders providers by priority and derives inCooldown', async () => {
    const future = new Date(Date.now() + 60_000)
    const past = new Date(Date.now() - 60_000)
    await db.insert(aiProviders).values([
      {
        label: 'Second',
        providerType: 'openai-compatible',
        baseUrl: 'https://b.example.com/v1',
        apiKeyEncrypted: 'x',
        apiKeyLast4: 'bbbb',
        model: 'm',
        priority: 2,
        enabled: true,
        cooldownUntil: future,
      },
      {
        label: 'First',
        providerType: 'openai-compatible',
        baseUrl: 'https://a.example.com/v1',
        apiKeyEncrypted: 'x',
        apiKeyLast4: 'aaaa',
        model: 'm',
        priority: 1,
        enabled: true,
        cooldownUntil: past,
      },
    ])

    const res = await configIaGet()
    const body = await res.json()
    expect(body.providers.map((p: { label: string }) => p.label)).toEqual(['First', 'Second'])
    expect(body.providers[0].inCooldown).toBe(false)
    expect(body.providers[1].inCooldown).toBe(true)
  })
})

describe('PUT /api/config-ia', () => {
  it('creates new providers, encrypting the apiKey', async () => {
    const res = await configIaPut(
      putRequest([
        {
          label: 'Groq',
          providerType: 'openai-compatible',
          baseUrl: 'https://api.groq.com/openai/v1',
          apiKey: 'sk-super-secret-key',
          model: 'llama-3.1',
          priority: 1,
          enabled: true,
        },
      ]),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.providers).toHaveLength(1)
    expect(body.providers[0].apiKeyLast4).toBe('-key')

    const [row] = await db.select().from(aiProviders)
    expect(decrypt(row.apiKeyEncrypted)).toBe('sk-super-secret-key')
  })

  it('rejects a new provider without an apiKey', async () => {
    const res = await configIaPut(
      putRequest([
        {
          label: 'Groq',
          providerType: 'openai-compatible',
          baseUrl: 'https://api.groq.com/openai/v1',
          model: 'llama-3.1',
          priority: 1,
          enabled: true,
        },
      ]),
    )
    expect(res.status).toBe(400)
    const rows = await db.select().from(aiProviders)
    expect(rows).toHaveLength(0)
  })

  it('rejects an invalid baseUrl', async () => {
    const res = await configIaPut(
      putRequest([
        {
          label: 'Groq',
          providerType: 'openai-compatible',
          baseUrl: 'ftp://not-http.example.com',
          apiKey: 'sk-key',
          model: 'llama-3.1',
          priority: 1,
          enabled: true,
        },
      ]),
    )
    expect(res.status).toBe(400)
  })

  it('replaces the whole list: removes providers absent from the new payload, adds new ones', async () => {
    const [existing] = await db
      .insert(aiProviders)
      .values({
        label: 'Old Provider',
        providerType: 'openai-compatible',
        baseUrl: 'https://old.example.com/v1',
        apiKeyEncrypted: 'iv:tag:cipher',
        apiKeyLast4: 'oldk',
        model: 'old-model',
        priority: 1,
        enabled: true,
      })
      .returning()

    const res = await configIaPut(
      putRequest([
        {
          label: 'New Provider',
          providerType: 'openai-compatible',
          baseUrl: 'https://new.example.com/v1',
          apiKey: 'sk-new-key',
          model: 'new-model',
          priority: 1,
          enabled: true,
        },
      ]),
    )
    expect(res.status).toBe(200)

    const rows = await db.select().from(aiProviders)
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('New Provider')

    const oldRow = await db.select().from(aiProviders).where(eq(aiProviders.id, existing.id))
    expect(oldRow).toHaveLength(0)
  })

  it('preserves the existing encrypted apiKey when apiKey is omitted on update', async () => {
    const [existing] = await db
      .insert(aiProviders)
      .values({
        label: 'Groq',
        providerType: 'openai-compatible',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeyEncrypted: 'iv:tag:cipher-orig',
        apiKeyLast4: 'orig',
        model: 'llama-3.1',
        priority: 1,
        enabled: true,
      })
      .returning()

    const res = await configIaPut(
      putRequest([
        {
          id: existing.id,
          label: 'Groq Renamed',
          providerType: 'openai-compatible',
          baseUrl: 'https://api.groq.com/openai/v1',
          model: 'llama-3.1',
          priority: 1,
          enabled: true,
          // no apiKey: must not overwrite the stored key
        },
      ]),
    )
    expect(res.status).toBe(200)

    const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, existing.id))
    expect(row.label).toBe('Groq Renamed')
    expect(row.apiKeyEncrypted).toBe('iv:tag:cipher-orig')
    expect(row.apiKeyLast4).toBe('orig')
  })

  it('re-encrypts the apiKey when a new one is provided on update', async () => {
    const [existing] = await db
      .insert(aiProviders)
      .values({
        label: 'Groq',
        providerType: 'openai-compatible',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeyEncrypted: 'iv:tag:cipher-orig',
        apiKeyLast4: 'orig',
        model: 'llama-3.1',
        priority: 1,
        enabled: true,
      })
      .returning()

    const res = await configIaPut(
      putRequest([
        {
          id: existing.id,
          label: 'Groq',
          providerType: 'openai-compatible',
          baseUrl: 'https://api.groq.com/openai/v1',
          apiKey: 'sk-brand-new-key',
          model: 'llama-3.1',
          priority: 1,
          enabled: true,
        },
      ]),
    )
    expect(res.status).toBe(200)

    const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, existing.id))
    expect(decrypt(row.apiKeyEncrypted)).toBe('sk-brand-new-key')
    expect(row.apiKeyLast4).toBe('-key')
  })

  it('writes an ai.config_updated audit row in the same transaction', async () => {
    const res = await configIaPut(
      putRequest([
        {
          label: 'Groq',
          providerType: 'openai-compatible',
          baseUrl: 'https://api.groq.com/openai/v1',
          apiKey: 'sk-key',
          model: 'llama-3.1',
          priority: 1,
          enabled: true,
        },
      ]),
    )
    expect(res.status).toBe(200)
    const row = await lastAuditRow()
    expect(row).toMatchObject({ action: 'ai.config_updated', status: 'success' })
    expect(row?.metadata).toMatchObject({ count: 1 })
  })

  it('rolls back everything when the audit log fails to write (strict mode)', async () => {
    mockedLogAudit.mockRejectedValueOnce(new Error('audit db down'))

    const res = await configIaPut(
      putRequest([
        {
          label: 'Groq',
          providerType: 'openai-compatible',
          baseUrl: 'https://api.groq.com/openai/v1',
          apiKey: 'sk-key',
          model: 'llama-3.1',
          priority: 1,
          enabled: true,
        },
      ]),
    )
    expect(res.status).toBe(500)

    const rows = await db.select().from(aiProviders)
    expect(rows).toHaveLength(0)
  })
})
