import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { aiSettings } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const [settings] = await db.select().from(aiSettings).limit(1)
  return NextResponse.json({
    systemPromptRules: settings?.systemPromptRules ?? null,
  })
}

export async function PUT(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: { systemPromptRules?: string | null }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  if (payload.systemPromptRules !== null && typeof payload.systemPromptRules !== 'string') {
    return NextResponse.json(
      { error: 'O campo "systemPromptRules" deve ser texto ou null.' },
      { status: 400 },
    )
  }

  const value = payload.systemPromptRules?.trim() || null

  try {
    await db.transaction(async (tx) => {
      // Singleton id=1 (seedado na migration) — upsert cobre um banco onde a
      // linha tenha sido apagada à mão.
      await tx
        .insert(aiSettings)
        .values({ id: 1, systemPromptRules: value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: aiSettings.id,
          set: { systemPromptRules: value, updatedAt: new Date() },
        })
      await logAudit(
        {
          action: 'ai.config_updated',
          actor: requester.username,
          status: 'success',
          metadata: { field: 'systemPromptRules', size: value?.length ?? 0 },
          request,
        },
        tx,
      )
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao salvar as regras.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
