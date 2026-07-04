import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getSessionFromRequest } from '@/lib/auth'
import { getRequestUser } from '@/lib/request-identity'
import { getAllowedSpecSlugs, isSpecAllowed } from '@/lib/spec-access'
import { logAudit } from '@/lib/audit'
import { listSpecs, saveSpec } from '@/lib/specs-store'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  // ACL por spec: a lista já vem filtrada pro usuário — o switcher e o
  // @menção do chat só enxergam o que os grupos dele permitem.
  const [specs, allowed] = await Promise.all([
    listSpecs(),
    getAllowedSpecSlugs(requester.id),
  ])
  return NextResponse.json({
    specs: specs.filter((spec) => isSpecAllowed(allowed, spec.slug)),
  })
}

export async function POST(request: Request) {
  let payload: {
    sourceUrl?: string
    title?: string
    description?: string | null
    version?: string | null
  }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Corpo da requisição inválido.' },
      { status: 400 },
    )
  }

  const { sourceUrl, title, description, version } = payload
  if (!sourceUrl || !title) {
    return NextResponse.json(
      { error: 'Os campos "sourceUrl" e "title" são obrigatórios.' },
      { status: 400 },
    )
  }

  const session = await getSessionFromRequest(request)
  const actor = session?.username ?? 'anonymous'

  try {
    const { record } = await db.transaction(async (tx) => {
      const result = await saveSpec({ sourceUrl, title, description, version }, tx)
      await logAudit(
        {
          action: result.event === 'created' ? 'spec.created' : 'spec.updated',
          actor,
          status: 'success',
          metadata: { slug: result.record.slug, sourceUrl },
          request,
        },
        tx,
      )
      return result
    })
    return NextResponse.json({ slug: record.slug, spec: record })
  } catch {
    return NextResponse.json(
      { error: 'Falha ao salvar a especificação.' },
      { status: 500 },
    )
  }
}
