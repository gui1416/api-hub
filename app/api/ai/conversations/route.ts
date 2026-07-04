import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiConversations } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'
import { canAccessSpecSource } from '@/lib/spec-access'

export const runtime = 'nodejs'

// Histórico isolado por usuário: cada um só lista/cria as próprias conversas.
export async function GET(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const sourceUrl = searchParams.get('sourceUrl')

  if (!sourceUrl) {
    return NextResponse.json({ error: 'Parâmetro "sourceUrl" é obrigatório.' }, { status: 400 })
  }

  // ACL por spec: 404 (não 403) pra não vazar a existência da spec.
  if (!(await canAccessSpecSource(requester.id, sourceUrl))) {
    return NextResponse.json({ error: 'Spec não encontrada.' }, { status: 404 })
  }

  const rows = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.specSourceUrl, sourceUrl),
        eq(aiConversations.userId, requester.id),
      ),
    )
    .orderBy(desc(aiConversations.updatedAt))

  return NextResponse.json({ conversations: rows })
}

export async function POST(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: { sourceUrl?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const { sourceUrl } = payload
  if (!sourceUrl) {
    return NextResponse.json({ error: 'O campo "sourceUrl" é obrigatório.' }, { status: 400 })
  }

  if (!(await canAccessSpecSource(requester.id, sourceUrl))) {
    return NextResponse.json({ error: 'Spec não encontrada.' }, { status: 404 })
  }

  const [created] = await db
    .insert(aiConversations)
    .values({ specSourceUrl: sourceUrl, userId: requester.id })
    .returning()

  return NextResponse.json({ conversation: created })
}
