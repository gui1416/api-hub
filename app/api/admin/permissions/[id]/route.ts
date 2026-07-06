import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { permissions } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Permissões seedadas que o próprio middleware/rotas referenciam por chave —
// removê-las quebraria o gate correspondente sem forma de recriar igual
// (a UI cria permissões novas com chave derivada do nome).
const PROTECTED_KEYS = new Set([
  'admin.users',
  'admin.groups',
  'admin.ai',
  'admin.dashboard',
  'admin.logs',
  'specs.load',
  'specs.delete',
  'proxy.use',
  'docs.view',
  'chat.use',
])

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const [target] = await db.select().from(permissions).where(eq(permissions.id, id)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'Permissão não encontrada.' }, { status: 404 })
  }

  if (PROTECTED_KEYS.has(target.key)) {
    return NextResponse.json(
      { error: 'Permissões de sistema não podem ser removidas.' },
      { status: 409 },
    )
  }

  try {
    await db.transaction(async (tx) => {
      // group_permissions tem ON DELETE CASCADE — remover a permissão já
      // revoga o acesso de todos os grupos que a tinham.
      await tx.delete(permissions).where(eq(permissions.id, target.id))
      await logAudit(
        {
          action: 'permission.deleted',
          actor: requester.username,
          status: 'success',
          metadata: { key: target.key },
          request,
        },
        tx,
      )
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao remover a permissão.' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
