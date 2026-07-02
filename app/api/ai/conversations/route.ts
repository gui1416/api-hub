import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiConversations } from '@/lib/db/schema'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sourceUrl = searchParams.get('sourceUrl')

  if (!sourceUrl) {
    return NextResponse.json({ error: 'Parâmetro "sourceUrl" é obrigatório.' }, { status: 400 })
  }

  const rows = await db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.specSourceUrl, sourceUrl))
    .orderBy(desc(aiConversations.updatedAt))

  return NextResponse.json({ conversations: rows })
}

export async function POST(request: Request) {
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

  const [created] = await db
    .insert(aiConversations)
    .values({ specSourceUrl: sourceUrl })
    .returning()

  return NextResponse.json({ conversation: created })
}
