import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getSessionFromRequest } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listSpecs, saveSpec } from '@/lib/specs-store'

export const runtime = 'nodejs'

export async function GET() {
  const specs = await listSpecs()
  return NextResponse.json({ specs })
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
  const actor = session?.sub ?? 'anonymous'

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
