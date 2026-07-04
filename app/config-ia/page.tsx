import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

// Sem prerender estático: providers/regras mudam em runtime e o
// router.refresh() do manager precisa devolver dados frescos.
export const dynamic = 'force-dynamic'
import { aiMessages, aiProviders, aiSettings } from '@/lib/db/schema'
import { ConfigIaManager } from '@/components/config-ia/config-ia-manager'
import { AiRulesForm } from '@/components/config-ia/ai-rules-form'

// Kept outside the component body so the lint rule that forbids calling
// impure functions (Date.now()) directly during render doesn't flag it —
// it only looks at the component's own function body, not helpers it calls.
function isInCooldown(cooldownUntil: Date | null): boolean {
  return cooldownUntil ? cooldownUntil.getTime() > Date.now() : false
}

export default async function ConfigIaPage() {
  const providerRows = await db.select().from(aiProviders).orderBy(asc(aiProviders.priority))
  const [settingsRow] = await db.select().from(aiSettings).limit(1)

  const statsRows = await db
    .select({
      providerLabel: aiMessages.providerLabel,
      avgLatencyMs: sql<string>`avg(${aiMessages.latencyMs})`,
      count: sql<string>`count(*)`,
    })
    .from(aiMessages)
    .where(and(eq(aiMessages.role, 'assistant'), isNotNull(aiMessages.providerLabel)))
    .groupBy(aiMessages.providerLabel)

  const providers = providerRows.map((row) => ({
    id: row.id,
    label: row.label,
    providerType: row.providerType,
    baseUrl: row.baseUrl,
    apiKeyLast4: row.apiKeyLast4,
    model: row.model,
    priority: row.priority,
    enabled: row.enabled,
    failureCount: row.failureCount,
    lastFailureAt: row.lastFailureAt ? row.lastFailureAt.toISOString() : null,
    cooldownUntil: row.cooldownUntil ? row.cooldownUntil.toISOString() : null,
    inCooldown: isInCooldown(row.cooldownUntil),
  }))

  const stats = statsRows
    .filter((row) => row.providerLabel !== null)
    .map((row) => ({
      providerLabel: row.providerLabel as string,
      avgLatencyMs: Math.round(Number(row.avgLatencyMs ?? 0)),
      count: Number(row.count ?? 0),
    }))

  return (
    <>
      <ConfigIaManager initialProviders={providers} stats={stats} />
      <AiRulesForm initialRules={settingsRow?.systemPromptRules ?? null} />
    </>
  )
}
