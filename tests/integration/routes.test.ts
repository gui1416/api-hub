import { desc, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/audit')>()
  return { ...actual, logAudit: vi.fn(actual.logAudit) }
})

import { logAudit } from '@/lib/audit'
import { db } from '@/lib/db/client'
import { auditLogs, specs, users } from '@/lib/db/schema'
import { hashPassword } from '@/lib/passwords'
import { POST as loginPost } from '@/app/api/auth/login/route'
import { POST as logoutPost } from '@/app/api/auth/logout/route'
import { POST as specsPost } from '@/app/api/specs/route'
import { DELETE as specDelete } from '@/app/api/specs/[slug]/route'
import { POST as proxyPost } from '@/app/api/proxy/route'

const mockedLogAudit = vi.mocked(logAudit)

const AUTH_USERNAME = process.env.AUTH_USERNAME!
const AUTH_PASSWORD = process.env.AUTH_PASSWORD!

// Hash uma vez só (bcrypt é caro) e reusa em todos os testes.
let passwordHash: string
beforeAll(async () => {
  passwordHash = await hashPassword(AUTH_PASSWORD)
})

beforeEach(async () => {
  await db.delete(auditLogs)
  await db.delete(specs)
  await db.delete(users).where(eq(users.username, AUTH_USERNAME))
  await db.insert(users).values({ username: AUTH_USERNAME, name: AUTH_USERNAME, passwordHash })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function lastAuditRow() {
  const [row] = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1)
  return row
}

function jsonRequest(url: string, body: unknown, init: RequestInit = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: JSON.stringify(body),
    ...init,
  })
}

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and writes a success audit row', async () => {
    const res = await loginPost(
      jsonRequest('http://test/api/auth/login', {
        username: AUTH_USERNAME,
        password: AUTH_PASSWORD,
      }),
    )
    expect(res.status).toBe(200)
    const row = await lastAuditRow()
    expect(row).toMatchObject({ action: 'auth.login', actor: AUTH_USERNAME, status: 'success' })
  })

  it('rejects invalid credentials and writes a failure audit row', async () => {
    const res = await loginPost(
      jsonRequest('http://test/api/auth/login', {
        username: AUTH_USERNAME,
        password: 'wrong-password',
      }),
    )
    expect(res.status).toBe(401)
    const row = await lastAuditRow()
    expect(row).toMatchObject({ action: 'auth.login', actor: AUTH_USERNAME, status: 'failure' })
  })

  it('records "anonymous" as the actor when no username is provided', async () => {
    const res = await loginPost(jsonRequest('http://test/api/auth/login', { password: 'x' }))
    expect(res.status).toBe(401)
    const row = await lastAuditRow()
    expect(row.actor).toBe('anonymous')
  })

  it('responds 500 instead of the normal outcome when the audit insert fails', async () => {
    mockedLogAudit.mockRejectedValueOnce(new Error('audit db down'))
    const res = await loginPost(
      jsonRequest('http://test/api/auth/login', {
        username: AUTH_USERNAME,
        password: AUTH_PASSWORD,
      }),
    )
    expect(res.status).toBe(500)
    // No session cookie should have been issued.
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('rejects a disabled user with 403 even with the right password', async () => {
    await db
      .update(users)
      .set({ status: 'disabled' })
      .where(eq(users.username, AUTH_USERNAME))
    const res = await loginPost(
      jsonRequest('http://test/api/auth/login', {
        username: AUTH_USERNAME,
        password: AUTH_PASSWORD,
      }),
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
    const row = await lastAuditRow()
    expect(row).toMatchObject({ action: 'auth.login', status: 'failure' })
    expect(row.metadata).toMatchObject({ reason: 'disabled' })
  })

  it('reports mustChangePassword and updates lastLoginAt on success', async () => {
    await db
      .update(users)
      .set({ mustChangePassword: true })
      .where(eq(users.username, AUTH_USERNAME))
    const res = await loginPost(
      jsonRequest('http://test/api/auth/login', {
        username: AUTH_USERNAME,
        password: AUTH_PASSWORD,
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ mustChangePassword: true })
    const [row] = await db.select().from(users).where(eq(users.username, AUTH_USERNAME))
    expect(row.lastLoginAt).not.toBeNull()
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the session and writes an audit row', async () => {
    const res = await logoutPost(new Request('http://test/api/auth/logout', { method: 'POST' }))
    expect(res.status).toBe(200)
    const row = await lastAuditRow()
    expect(row).toMatchObject({ action: 'auth.logout', status: 'success' })
  })
})

describe('POST /api/specs', () => {
  it('creates a spec and writes a spec.created audit row in the same transaction', async () => {
    const res = await specsPost(
      jsonRequest('http://test/api/specs', {
        sourceUrl: 'https://example.com/a.json',
        title: 'Integration Spec',
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.slug).toBe('integration-spec')

    const row = await lastAuditRow()
    expect(row).toMatchObject({ action: 'spec.created', status: 'success' })
    expect(row.metadata).toMatchObject({ slug: 'integration-spec' })
  })

  it('updates an existing spec and writes a spec.updated audit row', async () => {
    await specsPost(
      jsonRequest('http://test/api/specs', {
        sourceUrl: 'https://example.com/a.json',
        title: 'Original',
      }),
    )
    const res = await specsPost(
      jsonRequest('http://test/api/specs', {
        sourceUrl: 'https://example.com/a.json',
        title: 'Renamed',
      }),
    )
    expect(res.status).toBe(200)
    const row = await lastAuditRow()
    expect(row.action).toBe('spec.updated')
  })

  it('rolls back the spec insert when the audit log fails to write (strict mode)', async () => {
    mockedLogAudit.mockRejectedValueOnce(new Error('audit db down'))
    const res = await specsPost(
      jsonRequest('http://test/api/specs', {
        sourceUrl: 'https://example.com/rollback.json',
        title: 'Should Not Persist',
      }),
    )
    expect(res.status).toBe(500)

    const [row] = await db
      .select()
      .from(specs)
      .where(eq(specs.sourceUrl, 'https://example.com/rollback.json'))
    expect(row).toBeUndefined()
  })
})

describe('DELETE /api/specs/[slug]', () => {
  async function createSpec() {
    const res = await specsPost(
      jsonRequest('http://test/api/specs', {
        sourceUrl: 'https://example.com/delete-me.json',
        title: 'Delete Me',
      }),
    )
    const body = await res.json()
    return body.slug as string
  }

  it('deletes an existing spec and writes a spec.deleted audit row', async () => {
    const slug = await createSpec()
    const res = await specDelete(new Request(`http://test/api/specs/${slug}`, { method: 'DELETE' }), {
      params: Promise.resolve({ slug }),
    })
    expect(res.status).toBe(204)
    const row = await lastAuditRow()
    expect(row).toMatchObject({ action: 'spec.deleted', status: 'success' })
  })

  it('returns 404 for an unknown slug without writing an audit row', async () => {
    const before = await db.select().from(auditLogs)
    const res = await specDelete(new Request('http://test/api/specs/nope', { method: 'DELETE' }), {
      params: Promise.resolve({ slug: 'nope' }),
    })
    expect(res.status).toBe(404)
    const after = await db.select().from(auditLogs)
    expect(after.length).toBe(before.length)
  })

  it('rolls back the deletion when the audit log fails to write (strict mode)', async () => {
    const slug = await createSpec()
    mockedLogAudit.mockRejectedValueOnce(new Error('audit db down'))
    const res = await specDelete(new Request(`http://test/api/specs/${slug}`, { method: 'DELETE' }), {
      params: Promise.resolve({ slug }),
    })
    expect(res.status).toBe(500)

    const [row] = await db.select().from(specs).where(eq(specs.slug, slug))
    expect(row).toBeDefined()
  })
})

describe('POST /api/proxy', () => {
  it('proxies a successful upstream request and audits method/url/status/durationMs only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })),
    )

    const res = await proxyPost(
      jsonRequest('http://test/api/proxy', {
        method: 'GET',
        url: 'https://upstream.example.com/data',
        headers: { Authorization: 'Bearer super-secret' },
      }),
    )
    expect(res.status).toBe(200)

    const row = await lastAuditRow()
    expect(row).toMatchObject({ action: 'proxy.request', status: 'success' })
    expect(row.metadata).toMatchObject({
      method: 'GET',
      url: 'https://upstream.example.com/data',
      status: 200,
    })
    expect(row.metadata).not.toHaveProperty('headers')
    expect(row.metadata).not.toHaveProperty('body')
    expect(JSON.stringify(row.metadata)).not.toContain('super-secret')
  })

  it('audits a failed upstream request with status "failure" and returns 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unreachable')
      }),
    )

    const res = await proxyPost(
      jsonRequest('http://test/api/proxy', {
        method: 'GET',
        url: 'https://upstream.example.com/down',
      }),
    )
    expect(res.status).toBe(502)
    const row = await lastAuditRow()
    expect(row).toMatchObject({ action: 'proxy.request', status: 'failure' })
  })

  it('responds 500 when the audit log fails to write, even though the upstream call already happened', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    )
    mockedLogAudit.mockRejectedValueOnce(new Error('audit db down'))

    const res = await proxyPost(
      jsonRequest('http://test/api/proxy', {
        method: 'GET',
        url: 'https://upstream.example.com/data',
      }),
    )
    expect(res.status).toBe(500)
  })
})
