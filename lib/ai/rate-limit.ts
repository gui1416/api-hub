import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/lib/db/client'
import { aiMessages } from '@/lib/db/schema'

export interface RateLimitOk {
  ok: true
}

export interface RateLimitExceeded {
  ok: false
  message: string
}

export type RateLimitResult = RateLimitOk | RateLimitExceeded

const DEFAULT_HOURLY_LIMIT = 500_000
const DEFAULT_DAILY_LIMIT = 5_000_000

function tokenSumExpr() {
  // coalesce each side individually so a row with only one of the two
  // columns set (shouldn't normally happen, but defensive) still
  // contributes its known half instead of the whole row being skipped by
  // SUM's NULL-ignoring behavior.
  return sql<string>`coalesce(sum(coalesce(${aiMessages.promptTokens}, 0) + coalesce(${aiMessages.completionTokens}, 0)), 0)`
}

async function sumTokensSinceHours(db: DbOrTx, hours: number): Promise<number> {
  const [row] = await db
    .select({ total: tokenSumExpr() })
    .from(aiMessages)
    .where(sql`${aiMessages.createdAt} > now() - (${hours} * interval '1 hour')`)
  return Number(row?.total ?? 0)
}

/**
 * Checks accumulated `ai_messages` token usage (prompt + completion) against
 * the configured hourly/daily caps (`AI_RATE_LIMIT_TOKENS_PER_HOUR` /
 * `AI_RATE_LIMIT_TOKENS_PER_DAY`, falling back to conservative defaults).
 * Returns a clear pt-BR message identifying which window was exceeded so the
 * caller can surface it directly to the chat UI without calling any provider.
 */
export async function checkTokenRateLimit(db: DbOrTx): Promise<RateLimitResult> {
  const hourlyLimit = Number(process.env.AI_RATE_LIMIT_TOKENS_PER_HOUR) || DEFAULT_HOURLY_LIMIT
  const dailyLimit = Number(process.env.AI_RATE_LIMIT_TOKENS_PER_DAY) || DEFAULT_DAILY_LIMIT

  const hourlyTotal = await sumTokensSinceHours(db, 1)
  if (hourlyTotal >= hourlyLimit) {
    return {
      ok: false,
      message: `Limite de tokens por hora foi atingido (${hourlyTotal}/${hourlyLimit}). Tente novamente em instantes.`,
    }
  }

  const dailyTotal = await sumTokensSinceHours(db, 24)
  if (dailyTotal >= dailyLimit) {
    return {
      ok: false,
      message: `Limite de tokens por dia foi atingido (${dailyTotal}/${dailyLimit}). Tente novamente amanhã.`,
    }
  }

  return { ok: true }
}
