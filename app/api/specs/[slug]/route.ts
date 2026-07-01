import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getSessionFromRequest } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { deleteSpec } from '@/lib/specs-store'

export const runtime = 'nodejs'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const session = await getSessionFromRequest(request)
  const actor = session?.sub ?? 'anonymous'

  let removed: boolean
  try {
    removed = await db.transaction(async (tx) => {
      const deleted = await deleteSpec(slug, tx)
      if (deleted) {
        await logAudit(
          { action: 'spec.deleted', actor, status: 'success', metadata: { slug }, request },
          tx,
        )
      }
      return deleted
    })
  } catch {
    return NextResponse.json(
      { error: 'Falha ao remover a especificação.' },
      { status: 500 },
    )
  }

  if (!removed) {
    return NextResponse.json(
      { error: 'Especificação não encontrada.' },
      { status: 404 },
    )
  }

  return new NextResponse(null, { status: 204 })
}
