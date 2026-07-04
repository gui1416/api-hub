import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { groups, groupSpecs, specs } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Substitui a ACL de specs do grupo inteira (mesmo padrão "PUT substitui a
// lista" de .../permissions): allSpecs=true ignora/limpa a lista; false
// restringe o grupo aos slugs enviados.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: { allSpecs?: boolean; hubDocs?: boolean; specSlugs?: string[] }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  if (typeof payload.allSpecs !== 'boolean') {
    return NextResponse.json(
      { error: 'O campo "allSpecs" (boolean) é obrigatório.' },
      { status: 400 },
    )
  }
  // A doc padrão do hub é uma pseudo-spec da mesma ACL: allSpecs=true a
  // inclui; restrito, só entra com hubDocs explícito.
  const hubDocs = payload.allSpecs ? true : payload.hubDocs === true
  const specSlugs = payload.allSpecs ? [] : payload.specSlugs
  if (!payload.allSpecs && !Array.isArray(specSlugs)) {
    return NextResponse.json(
      { error: 'O campo "specSlugs" (array) é obrigatório quando allSpecs=false.' },
      { status: 400 },
    )
  }

  const [target] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'Grupo não encontrado.' }, { status: 404 })
  }

  let specRows: Array<{ slug: string }> = []
  if (!payload.allSpecs && specSlugs && specSlugs.length > 0) {
    specRows = await db
      .select({ slug: specs.slug })
      .from(specs)
      .where(inArray(specs.slug, specSlugs))
    if (specRows.length !== specSlugs.length) {
      return NextResponse.json({ error: 'Spec inexistente na seleção.' }, { status: 400 })
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(groups)
        .set({ allSpecs: payload.allSpecs, hubDocs, updatedAt: new Date() })
        .where(eq(groups.id, target.id))
      await tx.delete(groupSpecs).where(eq(groupSpecs.groupId, target.id))
      if (specRows.length > 0) {
        await tx
          .insert(groupSpecs)
          .values(specRows.map((spec) => ({ groupId: target.id, specSlug: spec.slug })))
      }
      await logAudit(
        {
          action: 'group.specs_updated',
          actor: requester.username,
          status: 'success',
          metadata: {
            name: target.name,
            allSpecs: payload.allSpecs,
            hubDocs,
            specs: specRows.map((spec) => spec.slug),
          },
          request,
        },
        tx,
      )
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao atualizar o acesso a specs do grupo.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
