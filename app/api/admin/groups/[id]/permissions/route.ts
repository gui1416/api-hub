import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { groupPermissions, groups, permissions } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Substitui o conjunto inteiro de permissões do grupo (mesmo padrão "PUT
// substitui a lista" do /api/config-ia).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: { permissionIds?: string[] }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  if (!Array.isArray(payload.permissionIds)) {
    return NextResponse.json(
      { error: 'O campo "permissionIds" (array) é obrigatório.' },
      { status: 400 },
    )
  }

  const [target] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'Grupo não encontrado.' }, { status: 404 })
  }

  let permissionRows: Array<{ id: string; key: string }> = []
  if (payload.permissionIds.length > 0) {
    permissionRows = await db
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.id, payload.permissionIds))
    if (permissionRows.length !== payload.permissionIds.length) {
      return NextResponse.json({ error: 'Permissão inexistente na seleção.' }, { status: 400 })
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(groupPermissions).where(eq(groupPermissions.groupId, target.id))
      if (permissionRows.length > 0) {
        await tx
          .insert(groupPermissions)
          .values(permissionRows.map((permission) => ({ groupId: target.id, permissionId: permission.id })))
      }
      await logAudit(
        {
          action: 'group.permissions_updated',
          actor: requester.username,
          status: 'success',
          metadata: { name: target.name, permissions: permissionRows.map((p) => p.key) },
          request,
        },
        tx,
      )
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao atualizar permissões do grupo.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
