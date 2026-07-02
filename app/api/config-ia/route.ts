import { NextResponse } from 'next/server'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiProviders } from '@/lib/db/schema'
import { getSessionFromRequest } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { encrypt, last4 } from '@/lib/ai/crypto'

export const runtime = 'nodejs'

type ProviderRow = typeof aiProviders.$inferSelect

function toPublic(row: ProviderRow) {
  const now = Date.now()
  return {
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
    inCooldown: row.cooldownUntil ? row.cooldownUntil.getTime() > now : false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function GET() {
  const rows = await db.select().from(aiProviders).orderBy(asc(aiProviders.priority))
  return NextResponse.json({ providers: rows.map(toPublic) })
}

interface PutProviderInput {
  id?: string
  label: string
  providerType: 'openai-compatible'
  baseUrl: string
  apiKey?: string
  model: string
  priority: number
  enabled: boolean
}

function isValidProviderInput(input: unknown): input is PutProviderInput {
  if (!input || typeof input !== 'object') return false
  const p = input as Record<string, unknown>
  if (typeof p.label !== 'string' || !p.label.trim()) return false
  if (typeof p.baseUrl !== 'string' || !/^https?:\/\//.test(p.baseUrl)) return false
  if (typeof p.model !== 'string' || !p.model.trim()) return false
  if (typeof p.priority !== 'number' || !Number.isInteger(p.priority)) return false
  if (p.providerType !== 'openai-compatible') return false
  if (typeof p.enabled !== 'boolean') return false
  if (p.id !== undefined && typeof p.id !== 'string') return false
  if (p.apiKey !== undefined && typeof p.apiKey !== 'string') return false
  return true
}

export async function PUT(request: Request) {
  let payload: { providers?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  if (!Array.isArray(payload.providers)) {
    return NextResponse.json(
      { error: 'O campo "providers" é obrigatório e deve ser uma lista.' },
      { status: 400 },
    )
  }

  for (const item of payload.providers) {
    if (!isValidProviderInput(item)) {
      return NextResponse.json(
        { error: 'Um ou mais providers têm campos inválidos (label/baseUrl/model/priority/providerType/enabled).' },
        { status: 400 },
      )
    }
  }

  const inputs = payload.providers as PutProviderInput[]

  // Providers without an id (new) or whose id no longer matches an existing
  // row are inserts, and inserts require an apiKey — validate this up front
  // (read-only) before opening the mutating transaction below.
  const existingIdsForValidation = new Set(
    (await db.select({ id: aiProviders.id }).from(aiProviders)).map((row) => row.id),
  )
  for (const input of inputs) {
    const isInsert = !input.id || !existingIdsForValidation.has(input.id)
    if (isInsert && !input.apiKey) {
      return NextResponse.json(
        { error: 'O campo "apiKey" é obrigatório para novos providers.' },
        { status: 400 },
      )
    }
  }

  const session = await getSessionFromRequest(request)
  const actor = session?.sub ?? 'anonymous'

  try {
    const saved = await db.transaction(async (tx) => {
      const existingRows = await tx.select().from(aiProviders)
      const existingById = new Map(existingRows.map((row) => [row.id, row]))
      const keepIds = new Set(inputs.filter((input) => input.id).map((input) => input.id as string))

      const idsToDelete = existingRows.filter((row) => !keepIds.has(row.id)).map((row) => row.id)
      if (idsToDelete.length > 0) {
        await tx.delete(aiProviders).where(inArray(aiProviders.id, idsToDelete))
      }

      const results: ProviderRow[] = []
      for (const input of inputs) {
        const existing = input.id ? existingById.get(input.id) : undefined

        if (existing) {
          const updateValues: Partial<typeof aiProviders.$inferInsert> = {
            label: input.label,
            providerType: input.providerType,
            baseUrl: input.baseUrl,
            model: input.model,
            priority: input.priority,
            enabled: input.enabled,
            updatedAt: new Date(),
          }
          if (input.apiKey) {
            updateValues.apiKeyEncrypted = encrypt(input.apiKey)
            updateValues.apiKeyLast4 = last4(input.apiKey)
          }
          const [updated] = await tx
            .update(aiProviders)
            .set(updateValues)
            .where(eq(aiProviders.id, existing.id))
            .returning()
          results.push(updated)
        } else {
          const apiKey = input.apiKey as string
          const [created] = await tx
            .insert(aiProviders)
            .values({
              label: input.label,
              providerType: input.providerType,
              baseUrl: input.baseUrl,
              apiKeyEncrypted: encrypt(apiKey),
              apiKeyLast4: last4(apiKey),
              model: input.model,
              priority: input.priority,
              enabled: input.enabled,
            })
            .returning()
          results.push(created)
        }
      }

      await logAudit(
        {
          action: 'ai.config_updated',
          actor,
          status: 'success',
          metadata: { count: inputs.length },
          request,
        },
        tx,
      )

      return results
    })

    saved.sort((a, b) => a.priority - b.priority)
    return NextResponse.json({ providers: saved.map(toPublic) })
  } catch {
    return NextResponse.json({ error: 'Falha ao salvar a configuração de IA.' }, { status: 500 })
  }
}
