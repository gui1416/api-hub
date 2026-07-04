import { and, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { aiConversations, aiMessages, aiProviders, users } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'

export const runtime = 'nodejs'

const RANGES_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const aggregates = {
  promptTokens: sql<string>`coalesce(sum(${aiMessages.promptTokens}), 0)`,
  completionTokens: sql<string>`coalesce(sum(${aiMessages.completionTokens}), 0)`,
  messages: sql<string>`count(*)`,
  avgLatencyMs: sql<string>`coalesce(avg(${aiMessages.latencyMs}), 0)`,
}

interface UsageRow {
  label: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  messages: number
  avgLatencyMs: number
}

function toUsageRow(row: {
  label: string | null
  promptTokens: string
  completionTokens: string
  messages: string
  avgLatencyMs: string
}): UsageRow {
  const promptTokens = Number(row.promptTokens)
  const completionTokens = Number(row.completionTokens)
  return {
    label: row.label ?? 'Usuário removido',
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    messages: Number(row.messages),
    avgLatencyMs: Math.round(Number(row.avgLatencyMs)),
  }
}

const byTotalTokensDesc = (a: UsageRow, b: UsageRow) => b.totalTokens - a.totalTokens

// Relatório completo de uso de um provider (sheet lateral do /config-ia).
// O vínculo histórico é por providerLabel (texto gravado em cada mensagem) —
// renomear o provider desassocia o histórico anterior ao rename.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const url = new URL(request.url)
  const range = url.searchParams.get('range') ?? '7d'
  const rangeMs = RANGES_MS[range]
  if (!rangeMs) {
    return NextResponse.json({ error: 'Range inválido: use 24h, 7d ou 30d.' }, { status: 400 })
  }
  const since = new Date(Date.now() - rangeMs)

  const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1)
  if (!provider) {
    return NextResponse.json({ error: 'Provider não encontrado.' }, { status: 404 })
  }

  // Só mensagens do assistente carregam métricas de tokens/latência.
  const providerSince = and(
    eq(aiMessages.role, 'assistant'),
    eq(aiMessages.providerLabel, provider.label),
    gte(aiMessages.createdAt, since),
  )

  const day = sql<string>`to_char(date_trunc('day', ${aiMessages.createdAt}), 'YYYY-MM-DD')`

  const [totalsRows, byDay, byModel, byUser, fallbackRows] = await Promise.all([
    db.select({ label: sql<string>`'total'`, ...aggregates }).from(aiMessages).where(providerSince),
    db
      .select({ label: day, ...aggregates })
      .from(aiMessages)
      .where(providerSince)
      .groupBy(day)
      .orderBy(day),
    db
      .select({ label: aiMessages.model, ...aggregates })
      .from(aiMessages)
      .where(providerSince)
      .groupBy(aiMessages.model),
    db
      .select({ label: users.username, ...aggregates })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .leftJoin(users, eq(users.id, aiConversations.userId))
      .where(providerSince)
      .groupBy(users.username),
    db
      .select({ n: sql<string>`count(*)` })
      .from(aiMessages)
      .where(and(providerSince, eq(aiMessages.usedFallback, true))),
  ])

  const totals = toUsageRow(totalsRows[0])

  return NextResponse.json({
    range,
    provider: {
      id: provider.id,
      label: provider.label,
      model: provider.model,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      priority: provider.priority,
      failureCount: provider.failureCount,
      lastFailureAt: provider.lastFailureAt?.toISOString() ?? null,
      cooldownUntil: provider.cooldownUntil?.toISOString() ?? null,
      inCooldown: provider.cooldownUntil
        ? provider.cooldownUntil.getTime() > Date.now()
        : false,
    },
    totals: {
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      totalTokens: totals.totalTokens,
      messages: totals.messages,
      avgLatencyMs: totals.avgLatencyMs,
      fallbackMessages: Number(fallbackRows[0]?.n ?? 0),
    },
    byDay: byDay.map(toUsageRow),
    byModel: byModel.filter((row) => row.label !== null).map(toUsageRow).sort(byTotalTokensDesc),
    byUser: byUser.map(toUsageRow).sort(byTotalTokensDesc),
  })
}
