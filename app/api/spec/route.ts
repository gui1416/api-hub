import { NextResponse } from 'next/server'
import { fetchSpec, FetchSpecError } from '@/lib/openapi/fetch-spec'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get('url')

  if (!target) {
    return NextResponse.json(
      { error: 'Parâmetro "url" é obrigatório.' },
      { status: 400 },
    )
  }

  try {
    const spec = await fetchSpec(target)
    return NextResponse.json({ spec })
  } catch (error) {
    if (error instanceof FetchSpecError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: 'Falha ao buscar a especificação.' },
      { status: 502 },
    )
  }
}
