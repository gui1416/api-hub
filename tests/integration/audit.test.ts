import { desc } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { logAudit } from '@/lib/audit'
import { db } from '@/lib/db/client'
import { auditLogs } from '@/lib/db/schema'

beforeEach(async () => {
  await db.delete(auditLogs)
})

async function lastRow() {
  const [row] = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1)
  return row
}

describe('logAudit', () => {
  it('inserts a row with the given action/actor/status/metadata', async () => {
    await logAudit({
      action: 'spec.created',
      actor: 'alice',
      status: 'success',
      metadata: { slug: 'my-spec' },
    })
    const row = await lastRow()
    expect(row).toMatchObject({
      action: 'spec.created',
      actor: 'alice',
      status: 'success',
      metadata: { slug: 'my-spec' },
    })
  })

  it('defaults metadata/ip/userAgent to null when not provided', async () => {
    await logAudit({ action: 'auth.logout', actor: 'alice', status: 'success' })
    const row = await lastRow()
    expect(row.metadata).toBeNull()
    expect(row.ip).toBeNull()
    expect(row.userAgent).toBeNull()
  })

  it('extracts ip from x-forwarded-for and user-agent from the request', async () => {
    const request = new Request('http://test/api/proxy', {
      headers: {
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
        'user-agent': 'vitest-agent/1.0',
      },
    })
    await logAudit({ action: 'proxy.request', actor: 'alice', status: 'success', request })
    const row = await lastRow()
    expect(row.ip).toBe('203.0.113.5')
    expect(row.userAgent).toBe('vitest-agent/1.0')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    const request = new Request('http://test/api/proxy', {
      headers: { 'x-real-ip': '198.51.100.9' },
    })
    await logAudit({ action: 'proxy.request', actor: 'alice', status: 'success', request })
    const row = await lastRow()
    expect(row.ip).toBe('198.51.100.9')
  })

  it('participates in an external transaction and rolls back with it', async () => {
    await expect(
      db.transaction(async (tx) => {
        await logAudit({ action: 'spec.deleted', actor: 'alice', status: 'success' }, tx)
        throw new Error('force rollback')
      }),
    ).rejects.toThrow('force rollback')

    const rows = await db.select().from(auditLogs)
    expect(rows).toHaveLength(0)
  })
})
