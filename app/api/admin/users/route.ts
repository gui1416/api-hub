import { asc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { groups, userGroups, users } from '@/lib/db/schema'
import { isOnline } from '@/lib/auth'
import { hashPassword, generateTemporaryPassword } from '@/lib/passwords'
import { getRequestUser } from '@/lib/request-identity'
import { parseProfileFields } from '@/lib/user-profile'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

const DEFAULT_GROUP = 'Usuários'
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/i

export async function GET(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      phone: users.phone,
      company: users.company,
      jobTitle: users.jobTitle,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      lastLogoutAt: users.lastLogoutAt,
      createdAt: users.createdAt,
      groupName: groups.name,
    })
    .from(users)
    .leftJoin(userGroups, eq(userGroups.userId, users.id))
    .leftJoin(groups, eq(groups.id, userGroups.groupId))
    .orderBy(asc(users.username))

  const byId = new Map<
    string,
    {
      id: string
      username: string
      name: string
      email: string | null
      phone: string | null
      company: string | null
      jobTitle: string | null
      status: 'active' | 'disabled'
      mustChangePassword: boolean
      online: boolean
      lastLoginAt: string | null
      lastLogoutAt: string | null
      createdAt: string
      groups: string[]
    }
  >()
  for (const row of rows) {
    let user = byId.get(row.id)
    if (!user) {
      user = {
        id: row.id,
        username: row.username,
        name: row.name,
        email: row.email,
        phone: row.phone,
        company: row.company,
        jobTitle: row.jobTitle,
        status: row.status,
        mustChangePassword: row.mustChangePassword,
        online: isOnline(row),
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
        lastLogoutAt: row.lastLogoutAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        groups: [],
      }
      byId.set(row.id, user)
    }
    if (row.groupName) user.groups.push(row.groupName)
  }

  return NextResponse.json({ users: [...byId.values()] })
}

export async function POST(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: {
    username?: string
    name?: string
    email?: string
    phone?: string
    company?: string
    jobTitle?: string
    groupIds?: string[]
  }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const username = payload.username?.trim().toLowerCase()
  if (!username || !USERNAME_PATTERN.test(username)) {
    return NextResponse.json(
      { error: 'Username inválido: use 3-64 caracteres (letras, números, ponto, hífen, underscore).' },
      { status: 400 },
    )
  }

  const parsed = parseProfileFields(payload)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const profile = parsed.fields

  const [duplicate] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  if (duplicate) {
    return NextResponse.json({ error: 'Já existe um usuário com esse username.' }, { status: 409 })
  }

  const [emailDuplicate] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1)
  if (emailDuplicate) {
    return NextResponse.json({ error: 'Já existe um usuário com esse email.' }, { status: 409 })
  }

  const requestedGroupIds = Array.isArray(payload.groupIds) ? payload.groupIds : []
  let groupRows: Array<{ id: string; name: string }>
  if (requestedGroupIds.length > 0) {
    groupRows = await db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(inArray(groups.id, requestedGroupIds))
    if (groupRows.length !== requestedGroupIds.length) {
      return NextResponse.json({ error: 'Grupo inexistente na seleção.' }, { status: 400 })
    }
  } else {
    groupRows = await db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(eq(groups.name, DEFAULT_GROUP))
  }

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)

  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ username, ...profile, passwordHash, mustChangePassword: true })
        .returning({ id: users.id, username: users.username })
      if (groupRows.length > 0) {
        await tx
          .insert(userGroups)
          .values(groupRows.map((group) => ({ userId: user.id, groupId: group.id })))
      }
      await logAudit(
        {
          action: 'user.created',
          actor: requester.username,
          status: 'success',
          metadata: { username, email: profile.email, groups: groupRows.map((group) => group.name) },
          request,
        },
        tx,
      )
      return user
    })

    // A senha temporária aparece só nesta resposta — nunca é persistida além
    // do hash nem logada.
    return NextResponse.json(
      { id: created.id, username: created.username, temporaryPassword },
      { status: 201 },
    )
  } catch {
    return NextResponse.json({ error: 'Falha ao criar o usuário.' }, { status: 500 })
  }
}
