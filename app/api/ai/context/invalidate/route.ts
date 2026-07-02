import { NextResponse } from 'next/server'
import { invalidateSpecCache } from '@/lib/ai/context'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { sourceUrl } = await request.json().catch(() => ({ sourceUrl: undefined }))
  if (!sourceUrl || typeof sourceUrl !== 'string') {
    return NextResponse.json({ error: 'O campo "sourceUrl" é obrigatório.' }, { status: 400 })
  }
  invalidateSpecCache(sourceUrl)
  return NextResponse.json({ ok: true })
}
