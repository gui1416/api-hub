import { and, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { aiConversations, aiMessages, users } from '@/lib/db/schema'
import { getRequestUser } from '@/lib/request-identity'

export const runtime = 'nodejs'

const RANGES_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

interface UsageRow {
  label: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  messages: number
  avgLatencyMs: number
}

const aggregates = {
  promptTokens: sql<string>`coalesce(sum(${aiMessages.promptTokens}), 0)`,
  completionTokens: sql<string>`coalesce(sum(${aiMessages.completionTokens}), 0)`,
  messages: sql<string>`count(*)`,
  avgLatencyMs: sql<string>`coalesce(avg(${aiMessages.latencyMs}), 0)`,
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

export async function GET(request: Request) {
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

  // Só mensagens do assistente carregam métricas de tokens/latência (as de
  // usuário têm essas colunas nulas), então toda agregação filtra por elas.
  const assistantSince = and(
    eq(aiMessages.role, 'assistant'),
    gte(aiMessages.createdAt, since),
  )

  const [byProvider, byModel, byUser] = await Promise.all([
    db
      .select({ label: aiMessages.providerLabel, ...aggregates })
      .from(aiMessages)
      .where(assistantSince)
      .groupBy(aiMessages.providerLabel),
    db
      .select({ label: aiMessages.model, ...aggregates })
      .from(aiMessages)
      .where(assistantSince)
      .groupBy(aiMessages.model),
    db
      .select({ label: users.username, ...aggregates })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .leftJoin(users, eq(users.id, aiConversations.userId))
      .where(assistantSince)
      .groupBy(users.username),
  ])

  return NextResponse.json({
    range,
    byProvider: byProvider
      .filter((row) => row.label !== null)
      .map(toUsageRow)
      .sort(byTotalTokensDesc),
    byModel: byModel
      .filter((row) => row.label !== null)
      .map(toUsageRow)
      .sort(byTotalTokensDesc),
    byUser: byUser.map(toUsageRow).sort(byTotalTokensDesc),
  })
}
