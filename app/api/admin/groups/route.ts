import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { groupPermissions, groups, permissions, userGroups } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const [groupRows, memberRows, permissionRows] = await Promise.all([
    db.select().from(groups).orderBy(asc(groups.name)),
    db
      .select({ groupId: userGroups.groupId, userId: userGroups.userId })
      .from(userGroups),
    db
      .select({ groupId: groupPermissions.groupId, permissionKey: permissions.key })
      .from(groupPermissions)
      .innerJoin(permissions, eq(permissions.id, groupPermissions.permissionId)),
  ])

  const memberCount = new Map<string, number>()
  for (const row of memberRows) {
    memberCount.set(row.groupId, (memberCount.get(row.groupId) ?? 0) + 1)
  }
  const permissionKeys = new Map<string, string[]>()
  for (const row of permissionRows) {
    const list = permissionKeys.get(row.groupId) ?? []
    list.push(row.permissionKey)
    permissionKeys.set(row.groupId, list)
  }

  return NextResponse.json({
    groups: groupRows.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      isSystem: group.isSystem,
      memberCount: memberCount.get(group.id) ?? 0,
      permissions: (permissionKeys.get(group.id) ?? []).sort(),
    })),
  })
}

export async function POST(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: { name?: string; description?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const name = payload.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'O campo "name" é obrigatório.' }, { status: 400 })
  }

  const [duplicate] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.name, name))
    .limit(1)
  if (duplicate) {
    return NextResponse.json({ error: 'Já existe um grupo com esse nome.' }, { status: 409 })
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(groups)
        .values({ name, description: payload.description?.trim() || null })
        .returning()
      await logAudit(
        {
          action: 'group.created',
          actor: requester.username,
          status: 'success',
          metadata: { name },
          request,
        },
        tx,
      )
      return group
    })
    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        description: created.description,
        isSystem: created.isSystem,
      },
      { status: 201 },
    )
  } catch {
    return NextResponse.json({ error: 'Falha ao criar o grupo.' }, { status: 500 })
  }
}
