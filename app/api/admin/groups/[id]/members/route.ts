import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { groups, userGroups, users } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

const ADMIN_GROUP = 'Administradores'

// Substitui o conjunto de membros do grupo (gestão pelo lado do grupo, como
// a aba "Members" do AD — o lado do usuário continua em PATCH /api/admin/
// users/:id { groupIds }).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: { userIds?: string[] }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  if (!Array.isArray(payload.userIds)) {
    return NextResponse.json(
      { error: 'O campo "userIds" (array) é obrigatório.' },
      { status: 400 },
    )
  }

  const [target] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'Grupo não encontrado.' }, { status: 404 })
  }

  let memberRows: Array<{ id: string; username: string; status: 'active' | 'disabled' }> = []
  if (payload.userIds.length > 0) {
    memberRows = await db
      .select({ id: users.id, username: users.username, status: users.status })
      .from(users)
      .where(inArray(users.id, payload.userIds))
    if (memberRows.length !== payload.userIds.length) {
      return NextResponse.json({ error: 'Usuário inexistente na seleção.' }, { status: 400 })
    }
  }

  // Salvaguarda de lockout (mesma família das de DELETE/PATCH de usuário):
  // o grupo Administradores nunca pode ficar sem nenhum membro ativo.
  if (target.name === ADMIN_GROUP && !memberRows.some((user) => user.status === 'active')) {
    return NextResponse.json(
      { error: 'O grupo Administradores precisa manter ao menos um membro ativo.' },
      { status: 409 },
    )
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(userGroups).where(eq(userGroups.groupId, target.id))
      if (memberRows.length > 0) {
        await tx
          .insert(userGroups)
          .values(memberRows.map((user) => ({ userId: user.id, groupId: target.id })))
      }
      await logAudit(
        {
          action: 'group.members_updated',
          actor: requester.username,
          status: 'success',
          metadata: { name: target.name, members: memberRows.map((user) => user.username) },
          request,
        },
        tx,
      )
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao atualizar os membros do grupo.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
