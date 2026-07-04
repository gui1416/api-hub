import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import {
  aiConversations,
  aiMessages,
  auditLogs,
  groups,
  userGroups,
  users,
} from '@/lib/db/schema'
import { hashPassword } from '@/lib/passwords'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { getUserAccess } from '@/lib/rbac'
import { POST as usersPost } from '@/app/api/admin/users/route'
import { DELETE as userDelete, PATCH as userPatch } from '@/app/api/admin/users/[id]/route'
import { PUT as groupMembersPut } from '@/app/api/admin/groups/[id]/members/route'
import { POST as resetPasswordPost } from '@/app/api/admin/users/[id]/reset-password/route'
import { GET as usageGet } from '@/app/api/admin/dashboard/usage/route'
import { POST as changePasswordPost } from '@/app/api/auth/change-password/route'

// Simula os headers que o middleware injeta (rotas invocadas direto, sem
// middleware na frente).
function asUser(user: { id: string; username: string }, init: RequestInit = {}, url = 'http://test/x') {
  return new Request(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-user-id': user.id,
      'x-user-name': encodeURIComponent(user.username),
      'x-user-groups': encodeURIComponent('Administradores'),
      'x-user-permissions': 'admin.users,admin.groups,admin.ai,admin.dashboard',
      ...init.headers,
    },
  })
}

let passwordHash: string
let admin: { id: string; username: string }

beforeAll(async () => {
  passwordHash = await hashPassword('integration-password')
})

beforeEach(async () => {
  await db.delete(auditLogs)
  await db.delete(aiConversations)
  await db.delete(users)
  const [row] = await db
    .insert(users)
    .values({ username: 'admin-int', name: 'Admin Int', passwordHash })
    .returning({ id: users.id, username: users.username })
  admin = row
  const [adminGroup] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.name, 'Administradores'))
  await db.insert(userGroups).values({ userId: admin.id, groupId: adminGroup.id })
})

describe('POST /api/admin/users', () => {
  it('creates a user in the default group with a one-time temporary password', async () => {
    const res = await usersPost(
      asUser(admin, {
        method: 'POST',
        body: JSON.stringify({
          username: 'maria',
          name: 'Maria Silva',
          email: 'maria@example.com',
          phone: '(11) 99999-0000',
          company: 'Acme',
          jobTitle: 'Dev',
        }),
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.temporaryPassword).toHaveLength(12)

    const access = await getUserAccess(body.id)
    expect(access?.groups).toEqual(['Usuários'])
    // Grupo default seedado: docs.view + chat.use, e proxy.use (migration 0004).
    expect(access?.permissions).toEqual(['chat.use', 'docs.view', 'proxy.use'])
    expect(access?.mustChangePassword).toBe(true)

    const [created] = await db.select().from(users).where(eq(users.id, body.id))
    expect(created).toMatchObject({
      name: 'Maria Silva',
      email: 'maria@example.com',
      phone: '(11) 99999-0000',
      company: 'Acme',
      jobTitle: 'Dev',
    })
  })

  it('rejects a missing name or email with 400', async () => {
    const res = await usersPost(
      asUser(admin, { method: 'POST', body: JSON.stringify({ username: 'maria' }) }),
    )
    expect(res.status).toBe(400)
  })

  it('rejects a duplicate username with 409', async () => {
    await usersPost(
      asUser(admin, {
        method: 'POST',
        body: JSON.stringify({ username: 'maria', name: 'Maria', email: 'maria@example.com' }),
      }),
    )
    const res = await usersPost(
      asUser(admin, {
        method: 'POST',
        body: JSON.stringify({ username: 'maria', name: 'Maria 2', email: 'maria2@example.com' }),
      }),
    )
    expect(res.status).toBe(409)
  })

  it('rejects a duplicate email with 409', async () => {
    await usersPost(
      asUser(admin, {
        method: 'POST',
        body: JSON.stringify({ username: 'maria', name: 'Maria', email: 'maria@example.com' }),
      }),
    )
    const res = await usersPost(
      asUser(admin, {
        method: 'POST',
        body: JSON.stringify({ username: 'outra', name: 'Outra', email: 'MARIA@example.com' }),
      }),
    )
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/admin/users/:id', () => {
  it('refuses self-deletion with 409', async () => {
    const res = await userDelete(asUser(admin, { method: 'DELETE' }), {
      params: Promise.resolve({ id: admin.id }),
    })
    expect(res.status).toBe(409)
  })

  it('refuses to delete the last active admin', async () => {
    // admin tenta remover... um segundo admin desativado não conta como
    // cobertura, então criar outro admin ativo primeiro e remover o original
    // deve funcionar; sem outro admin, remover o único falha.
    const [other] = await db
      .insert(users)
      .values({ username: 'other-admin', name: 'Other Admin', passwordHash })
      .returning({ id: users.id, username: users.username })
    // other não é admin: remover o único admin (via other) deve falhar
    const res = await userDelete(asUser(other, { method: 'DELETE' }), {
      params: Promise.resolve({ id: admin.id }),
    })
    expect(res.status).toBe(409)
  })

  it('deletes a user, orphaning conversations instead of cascading', async () => {
    const [target] = await db
      .insert(users)
      .values({ username: 'to-remove', name: 'To Remove', passwordHash })
      .returning({ id: users.id, username: users.username })
    const [conversation] = await db
      .insert(aiConversations)
      .values({ specSourceUrl: 'https://example.com/spec.json', userId: target.id })
      .returning({ id: aiConversations.id })
    await db.insert(aiMessages).values({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'olá',
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 800,
      providerLabel: 'groq',
      model: 'llama-3.3-70b',
    })

    const res = await userDelete(asUser(admin, { method: 'DELETE' }), {
      params: Promise.resolve({ id: target.id }),
    })
    expect(res.status).toBe(204)

    const [kept] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, conversation.id))
    expect(kept).toBeDefined()
    expect(kept.userId).toBeNull()

    // Uso do usuário removido agrupa como "Usuário removido" no dashboard.
    const usage = await usageGet(asUser(admin, { method: 'GET' }, 'http://test/api/admin/dashboard/usage?range=24h'))
    expect(usage.status).toBe(200)
    const data = await usage.json()
    expect(data.byUser).toContainEqual(
      expect.objectContaining({ label: 'Usuário removido', totalTokens: 150 }),
    )
  })
})

describe('PATCH /api/admin/users/:id', () => {
  it('deactivates a user and audits it', async () => {
    const [target] = await db
      .insert(users)
      .values({ username: 'to-disable', name: 'To Disable', passwordHash })
      .returning({ id: users.id, username: users.username })

    const res = await userPatch(
      asUser(admin, { method: 'PATCH', body: JSON.stringify({ status: 'disabled' }) }),
      { params: Promise.resolve({ id: target.id }) },
    )
    expect(res.status).toBe(200)

    const access = await getUserAccess(target.id)
    expect(access?.status).toBe('disabled')

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.deactivated'))
    expect(audit).toBeDefined()
  })

  it('updates profile fields and audits user.updated', async () => {
    const [target] = await db
      .insert(users)
      .values({ username: 'profiled', name: 'Antes', email: 'antes@example.com', passwordHash })
      .returning({ id: users.id, username: users.username })

    const res = await userPatch(
      asUser(admin, {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Depois da Silva',
          email: 'depois@example.com',
          phone: '(21) 98888-7777',
          company: 'Acme',
          jobTitle: 'QA',
        }),
      }),
      { params: Promise.resolve({ id: target.id }) },
    )
    expect(res.status).toBe(200)

    const [updated] = await db.select().from(users).where(eq(users.id, target.id))
    expect(updated).toMatchObject({
      name: 'Depois da Silva',
      email: 'depois@example.com',
      phone: '(21) 98888-7777',
      company: 'Acme',
      jobTitle: 'QA',
    })

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.updated'))
    expect(audit).toBeDefined()
  })

  it('rejects a profile email already used by another user with 409', async () => {
    await db
      .insert(users)
      .values({ username: 'dona-do-email', name: 'Dona', email: 'ocupado@example.com', passwordHash })
    const [target] = await db
      .insert(users)
      .values({ username: 'quer-o-email', name: 'Quer', passwordHash })
      .returning({ id: users.id, username: users.username })

    const res = await userPatch(
      asUser(admin, {
        method: 'PATCH',
        body: JSON.stringify({ email: 'ocupado@example.com' }),
      }),
      { params: Promise.resolve({ id: target.id }) },
    )
    expect(res.status).toBe(409)
  })

  it('refuses disabling the last active admin', async () => {
    const [other] = await db
      .insert(users)
      .values({ username: 'other', name: 'Other', passwordHash })
      .returning({ id: users.id, username: users.username })
    const res = await userPatch(
      asUser(other, { method: 'PATCH', body: JSON.stringify({ status: 'disabled' }) }),
      { params: Promise.resolve({ id: admin.id }) },
    )
    expect(res.status).toBe(409)
  })
})

describe('PUT /api/admin/groups/:id/members', () => {
  it('replaces the member set and audits group.members_updated', async () => {
    const [extra] = await db
      .insert(users)
      .values({ username: 'novo-membro', name: 'Novo Membro', passwordHash })
      .returning({ id: users.id })
    const [adminGroup] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.name, 'Administradores'))

    const res = await groupMembersPut(
      asUser(admin, {
        method: 'PUT',
        body: JSON.stringify({ userIds: [admin.id, extra.id] }),
      }),
      { params: Promise.resolve({ id: adminGroup.id }) },
    )
    expect(res.status).toBe(200)

    const members = await db
      .select({ userId: userGroups.userId })
      .from(userGroups)
      .where(eq(userGroups.groupId, adminGroup.id))
    expect(members.map((m) => m.userId).sort()).toEqual([admin.id, extra.id].sort())

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'group.members_updated'))
    expect(audit).toBeDefined()
  })

  it('refuses to leave Administradores without an active member', async () => {
    const [adminGroup] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.name, 'Administradores'))

    const res = await groupMembersPut(
      asUser(admin, { method: 'PUT', body: JSON.stringify({ userIds: [] }) }),
      { params: Promise.resolve({ id: adminGroup.id }) },
    )
    expect(res.status).toBe(409)
  })
})

describe('reset-password + change-password', () => {
  it('resets to a temporary password and the user is forced to change it', async () => {
    const [target] = await db
      .insert(users)
      .values({ username: 'resetme', name: 'Reset Me', passwordHash })
      .returning({ id: users.id, username: users.username })

    const resetRes = await resetPasswordPost(asUser(admin, { method: 'POST' }), {
      params: Promise.resolve({ id: target.id }),
    })
    expect(resetRes.status).toBe(200)
    const { temporaryPassword } = await resetRes.json()
    expect(typeof temporaryPassword).toBe('string')

    const [afterReset] = await db.select().from(users).where(eq(users.id, target.id))
    expect(afterReset.mustChangePassword).toBe(true)

    // Troca de senha com a temporária: zera a flag e reemite o cookie.
    const token = await createSessionToken({
      sub: target.id,
      username: target.username,
      mustChangePassword: true,
    })
    const changeRes = await changePasswordPost(
      new Request('http://test/api/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify({
          currentPassword: temporaryPassword,
          newPassword: 'nova-senha-segura',
        }),
      }),
    )
    expect(changeRes.status).toBe(200)
    expect(changeRes.headers.get('set-cookie')).toContain(SESSION_COOKIE)

    const [afterChange] = await db.select().from(users).where(eq(users.id, target.id))
    expect(afterChange.mustChangePassword).toBe(false)
  })

  it('rejects a wrong current password', async () => {
    const token = await createSessionToken({
      sub: admin.id,
      username: admin.username,
      mustChangePassword: false,
    })
    const res = await changePasswordPost(
      new Request('http://test/api/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify({
          currentPassword: 'errada',
          newPassword: 'nova-senha-segura',
        }),
      }),
    )
    expect(res.status).toBe(400)
  })
})
