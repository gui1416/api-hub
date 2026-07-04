import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { groups } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  const [target] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'Grupo não encontrado.' }, { status: 404 })
  }

  const name = payload.name?.trim()
  if (payload.name !== undefined && !name) {
    return NextResponse.json({ error: 'O nome não pode ficar vazio.' }, { status: 400 })
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(groups)
        .set({
          ...(name ? { name } : {}),
          ...(payload.description !== undefined
            ? { description: payload.description.trim() || null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(groups.id, target.id))
      await logAudit(
        {
          action: 'group.updated',
          actor: requester.username,
          status: 'success',
          metadata: { name: name ?? target.name },
          request,
        },
        tx,
      )
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao atualizar o grupo.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const [target] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'Grupo não encontrado.' }, { status: 404 })
  }

  // Grupos de sistema (Administradores/Usuários) não podem ser removidos —
  // garante que sempre existe um grupo com as permissões admin (anti-lockout).
  if (target.isSystem) {
    return NextResponse.json(
      { error: 'Grupos de sistema não podem ser removidos.' },
      { status: 409 },
    )
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(groups).where(eq(groups.id, target.id))
      await logAudit(
        {
          action: 'group.deleted',
          actor: requester.username,
          status: 'success',
          metadata: { name: target.name },
          request,
        },
        tx,
      )
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao remover o grupo.' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
