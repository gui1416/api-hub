import { eq, inArray } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import {
  aiConversations,
  auditLogs,
  groups,
  groupSpecs,
  specs,
  userGroups,
  users,
} from '@/lib/db/schema'
import { hashPassword } from '@/lib/passwords'
import {
  canAccessHubDocs,
  canAccessSpecSource,
  getAllowedSpecSlugs,
  isSpecAllowed,
} from '@/lib/spec-access'
import { GET as specsGet } from '@/app/api/specs/route'
import { PUT as groupSpecsPut } from '@/app/api/admin/groups/[id]/specs/route'

// Grupos criados por este arquivo (os seedados pela migration ficam intactos).
const TEST_GROUPS = ['ACL Restrito', 'ACL Aberto']

function asUser(user: { id: string; username: string }, init: RequestInit = {}, url = 'http://test/x') {
  return new Request(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-user-id': user.id,
      'x-user-name': encodeURIComponent(user.username),
      'x-user-groups': encodeURIComponent(''),
      'x-user-permissions': 'docs.view',
      ...init.headers,
    },
  })
}

let passwordHash: string
let member: { id: string; username: string }
let restrictedGroupId: string

beforeAll(async () => {
  passwordHash = await hashPassword('integration-password')
})

beforeEach(async () => {
  await db.delete(auditLogs)
  await db.delete(aiConversations)
  await db.delete(users)
  await db.delete(specs)
  await db.delete(groups).where(inArray(groups.name, TEST_GROUPS))

  await db.insert(specs).values([
    { slug: 'spec-a', sourceUrl: 'https://example.com/a.json', title: 'Spec A' },
    { slug: 'spec-b', sourceUrl: 'https://example.com/b.json', title: 'Spec B' },
  ])

  const [user] = await db
    .insert(users)
    .values({ username: 'acl-user', name: 'ACL User', passwordHash })
    .returning({ id: users.id, username: users.username })
  member = user

  const [restricted] = await db
    .insert(groups)
    .values({ name: 'ACL Restrito', allSpecs: false, hubDocs: false })
    .returning({ id: groups.id })
  restrictedGroupId = restricted.id
  await db.insert(groupSpecs).values({ groupId: restrictedGroupId, specSlug: 'spec-a' })
  await db.insert(userGroups).values({ userId: member.id, groupId: restrictedGroupId })
})

describe('getAllowedSpecSlugs', () => {
  it('restricts a user to the specs of their allSpecs=false groups', async () => {
    const allowed = await getAllowedSpecSlugs(member.id)
    expect(allowed).not.toBe('all')
    expect(isSpecAllowed(allowed, 'spec-a')).toBe(true)
    expect(isSpecAllowed(allowed, 'spec-b')).toBe(false)
  })

  it('returns "all" when any group of the user has allSpecs=true', async () => {
    const [open] = await db
      .insert(groups)
      .values({ name: 'ACL Aberto', allSpecs: true })
      .returning({ id: groups.id })
    await db.insert(userGroups).values({ userId: member.id, groupId: open.id })

    expect(await getAllowedSpecSlugs(member.id)).toBe('all')
  })

  it('returns an empty set for a user with no groups', async () => {
    await db.delete(userGroups).where(eq(userGroups.userId, member.id))
    const allowed = await getAllowedSpecSlugs(member.id)
    expect(allowed).not.toBe('all')
    expect((allowed as Set<string>).size).toBe(0)
  })
})

describe('canAccessHubDocs (doc padrão do hub como pseudo-spec)', () => {
  it('denies when the only group is restricted with hubDocs=false', async () => {
    expect(await canAccessHubDocs(member.id)).toBe(false)
  })

  it('allows via hubDocs=true on a restricted group', async () => {
    await db.update(groups).set({ hubDocs: true }).where(eq(groups.id, restrictedGroupId))
    expect(await canAccessHubDocs(member.id)).toBe(true)
  })

  it('allows via any allSpecs=true group', async () => {
    const [open] = await db
      .insert(groups)
      .values({ name: 'ACL Aberto', allSpecs: true, hubDocs: false })
      .returning({ id: groups.id })
    await db.insert(userGroups).values({ userId: member.id, groupId: open.id })
    expect(await canAccessHubDocs(member.id)).toBe(true)
  })

  it('PUT .../specs controls hubDocs (e allSpecs=true força true)', async () => {
    const grant = await groupSpecsPut(
      asUser(member, {
        method: 'PUT',
        body: JSON.stringify({ allSpecs: false, hubDocs: true, specSlugs: [] }),
      }),
      { params: Promise.resolve({ id: restrictedGroupId }) },
    )
    expect(grant.status).toBe(200)
    expect(await canAccessHubDocs(member.id)).toBe(true)

    const revoke = await groupSpecsPut(
      asUser(member, {
        method: 'PUT',
        body: JSON.stringify({ allSpecs: false, hubDocs: false, specSlugs: [] }),
      }),
      { params: Promise.resolve({ id: restrictedGroupId }) },
    )
    expect(revoke.status).toBe(200)
    expect(await canAccessHubDocs(member.id)).toBe(false)

    const all = await groupSpecsPut(
      asUser(member, { method: 'PUT', body: JSON.stringify({ allSpecs: true }) }),
      { params: Promise.resolve({ id: restrictedGroupId }) },
    )
    expect(all.status).toBe(200)
    const [row] = await db
      .select({ hubDocs: groups.hubDocs })
      .from(groups)
      .where(eq(groups.id, restrictedGroupId))
    expect(row.hubDocs).toBe(true)
  })
})

describe('GET /api/specs (filtro da ACL)', () => {
  it('lists only the specs the user can access', async () => {
    const res = await specsGet(asUser(member, { method: 'GET' }, 'http://test/api/specs'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.specs.map((spec: { slug: string }) => spec.slug)).toEqual(['spec-a'])
  })
})

describe('canAccessSpecSource (chat)', () => {
  it('blocks the sourceUrl of a registered spec outside the ACL', async () => {
    expect(await canAccessSpecSource(member.id, 'https://example.com/b.json')).toBe(false)
    expect(await canAccessSpecSource(member.id, 'https://example.com/a.json')).toBe(true)
  })

  it('allows an unregistered sourceUrl (a ACL só cobre o catálogo)', async () => {
    expect(await canAccessSpecSource(member.id, 'https://example.com/livre.json')).toBe(true)
  })
})

describe('PUT /api/admin/groups/:id/specs', () => {
  it('replaces the ACL and audits group.specs_updated', async () => {
    const res = await groupSpecsPut(
      asUser(member, {
        method: 'PUT',
        body: JSON.stringify({ allSpecs: false, specSlugs: ['spec-b'] }),
      }),
      { params: Promise.resolve({ id: restrictedGroupId }) },
    )
    expect(res.status).toBe(200)

    const allowed = await getAllowedSpecSlugs(member.id)
    expect(isSpecAllowed(allowed, 'spec-b')).toBe(true)
    expect(isSpecAllowed(allowed, 'spec-a')).toBe(false)

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'group.specs_updated'))
    expect(audit).toBeDefined()
  })

  it('allSpecs=true clears the restriction list', async () => {
    const res = await groupSpecsPut(
      asUser(member, { method: 'PUT', body: JSON.stringify({ allSpecs: true }) }),
      { params: Promise.resolve({ id: restrictedGroupId }) },
    )
    expect(res.status).toBe(200)
    expect(await getAllowedSpecSlugs(member.id)).toBe('all')
    const rows = await db
      .select()
      .from(groupSpecs)
      .where(eq(groupSpecs.groupId, restrictedGroupId))
    expect(rows).toHaveLength(0)
  })

  it('rejects an unknown spec slug with 400', async () => {
    const res = await groupSpecsPut(
      asUser(member, {
        method: 'PUT',
        body: JSON.stringify({ allSpecs: false, specSlugs: ['nao-existe'] }),
      }),
      { params: Promise.resolve({ id: restrictedGroupId }) },
    )
    expect(res.status).toBe(400)
  })
})
