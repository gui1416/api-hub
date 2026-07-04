import { and, count, eq, inArray, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { groups, userGroups, users } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'
import { EMAIL_PATTERN } from '@/lib/user-profile'
import { logAudit, type AuditAction } from '@/lib/audit'

export const runtime = 'nodejs'

const ADMIN_GROUP = 'Administradores'

/**
 * True se `userId` é o único membro do grupo Administradores — removê-lo ou
 * desativá-lo deixaria a instância sem ninguém com acesso admin (lockout).
 */
async function isLastAdmin(userId: string): Promise<boolean> {
  const [adminGroup] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.name, ADMIN_GROUP))
    .limit(1)
  if (!adminGroup) return false

  const [membership] = await db
    .select({ n: count() })
    .from(userGroups)
    .where(and(eq(userGroups.groupId, adminGroup.id), eq(userGroups.userId, userId)))
  if (Number(membership.n) === 0) return false

  const [others] = await db
    .select({ n: count() })
    .from(userGroups)
    .innerJoin(users, eq(users.id, userGroups.userId))
    .where(
      and(
        eq(userGroups.groupId, adminGroup.id),
        ne(userGroups.userId, userId),
        eq(users.status, 'active'),
      ),
    )
  return Number(others.n) === 0
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: {
    status?: 'active' | 'disabled'
    groupIds?: string[]
    name?: string
    email?: string
    phone?: string | null
    company?: string | null
    jobTitle?: string | null
  }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  }

  const changingStatus =
    payload.status !== undefined && payload.status !== target.status
  const changingGroups = Array.isArray(payload.groupIds)

  // Perfil: só os campos presentes no payload são alterados; name/email não
  // podem ficar vazios (são obrigatórios desde a criação).
  const profileUpdate: Partial<{
    name: string
    email: string
    phone: string | null
    company: string | null
    jobTitle: string | null
  }> = {}
  if (payload.name !== undefined) {
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'O campo "name" não pode ficar vazio.' }, { status: 400 })
    }
    profileUpdate.name = name
  }
  if (payload.email !== undefined) {
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    if (!email || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
    }
    if (email !== target.email) {
      const [emailDuplicate] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
      if (emailDuplicate) {
        return NextResponse.json({ error: 'Já existe um usuário com esse email.' }, { status: 409 })
      }
    }
    profileUpdate.email = email
  }
  for (const field of ['phone', 'company', 'jobTitle'] as const) {
    const value = payload[field]
    if (value !== undefined) {
      profileUpdate[field] =
        typeof value === 'string' && value.trim() ? value.trim() : null
    }
  }
  const changingProfile = Object.keys(profileUpdate).length > 0

  if (!changingStatus && !changingGroups && !changingProfile) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  if (changingStatus && payload.status === 'disabled') {
    if (target.id === requester.id) {
      return NextResponse.json(
        { error: 'Você não pode desativar a si mesmo.' },
        { status: 409 },
      )
    }
    if (await isLastAdmin(target.id)) {
      return NextResponse.json(
        { error: 'Não é possível desativar o último administrador ativo.' },
        { status: 409 },
      )
    }
  }

  let groupRows: Array<{ id: string; name: string }> = []
  if (changingGroups) {
    const groupIds = payload.groupIds as string[]
    if (groupIds.length > 0) {
      groupRows = await db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(inArray(groups.id, groupIds))
      if (groupRows.length !== groupIds.length) {
        return NextResponse.json({ error: 'Grupo inexistente na seleção.' }, { status: 400 })
      }
    }
    // Tirar o próprio requester do grupo admin (ou tirar o último admin do
    // grupo) também é caminho de lockout — mesma salvaguarda do delete.
    const losingAdmin =
      (await isLastAdmin(target.id)) &&
      !groupRows.some((group) => group.name === ADMIN_GROUP)
    if (losingAdmin) {
      return NextResponse.json(
        { error: 'Não é possível remover o último administrador do grupo Administradores.' },
        { status: 409 },
      )
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (changingStatus) {
        await tx
          .update(users)
          .set({ status: payload.status, updatedAt: new Date() })
          .where(eq(users.id, target.id))
        const action: AuditAction =
          payload.status === 'active' ? 'user.activated' : 'user.deactivated'
        await logAudit(
          {
            action,
            actor: requester.username,
            status: 'success',
            metadata: { username: target.username },
            request,
          },
          tx,
        )
      }
      if (changingProfile) {
        await tx
          .update(users)
          .set({ ...profileUpdate, updatedAt: new Date() })
          .where(eq(users.id, target.id))
        await logAudit(
          {
            action: 'user.updated',
            actor: requester.username,
            status: 'success',
            metadata: { username: target.username, fields: Object.keys(profileUpdate) },
            request,
          },
          tx,
        )
      }
      if (changingGroups) {
        await tx.delete(userGroups).where(eq(userGroups.userId, target.id))
        if (groupRows.length > 0) {
          await tx
            .insert(userGroups)
            .values(groupRows.map((group) => ({ userId: target.id, groupId: group.id })))
        }
        await logAudit(
          {
            action: 'user.groups_updated',
            actor: requester.username,
            status: 'success',
            metadata: { username: target.username, groups: groupRows.map((group) => group.name) },
            request,
          },
          tx,
        )
      }
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao atualizar o usuário.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  }

  if (target.id === requester.id) {
    return NextResponse.json(
      { error: 'Você não pode remover a si mesmo.' },
      { status: 409 },
    )
  }
  if (await isLastAdmin(target.id)) {
    return NextResponse.json(
      { error: 'Não é possível remover o último administrador ativo.' },
      { status: 409 },
    )
  }

  try {
    await db.transaction(async (tx) => {
      // ai_conversations.user_id tem ON DELETE SET NULL — o histórico de
      // conversas/uso sobrevive como "usuário removido" no dashboard.
      await tx.delete(users).where(eq(users.id, target.id))
      await logAudit(
        {
          action: 'user.deleted',
          actor: requester.username,
          status: 'success',
          metadata: { username: target.username },
          request,
        },
        tx,
      )
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao remover o usuário.' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
