import { NextResponse } from 'next/server'
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

  const record = await saveSpec({ sourceUrl, title, description, version })
  return NextResponse.json({ slug: record.slug, spec: record })
}
