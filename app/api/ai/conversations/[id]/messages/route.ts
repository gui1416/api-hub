import { NextResponse } from 'next/server'
import { and, asc, desc, eq, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiConversations, aiMessages, aiProviders } from '@/lib/db/schema'
import { getSpec } from '@/lib/specs-store'
import { fetchSpec } from '@/lib/openapi/fetch-spec'
import { getSpecContext, summarizeSpec } from '@/lib/ai/context'
import { checkTokenRateLimit } from '@/lib/ai/rate-limit'
import {
  runChatCompletion,
  type AiProviderRow,
  type ChatEvent,
  type ChatHistoryMessage,
  type FailureKind,
} from '@/lib/ai/provider-client'

export const runtime = 'nodejs'

// How many prior messages (user + assistant) to pass as conversation history
// to the model on each turn.
const HISTORY_LIMIT = 20
// Conversation titles are derived from the first user message, truncated to
// roughly this many characters (cut on a word boundary, not mid-word).
const TITLE_MAX_LENGTH = 50

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const rows = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, id))
    .orderBy(asc(aiMessages.createdAt))

  return NextResponse.json({ messages: rows })
}

function truncateTitle(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed
  const slice = trimmed.slice(0, TITLE_MAX_LENGTH)
  const lastSpace = slice.lastIndexOf(' ')
  // Only cut on the space if it doesn't throw away most of the slice —
  // otherwise (e.g. one long word) just hard-cut at the max length.
  const cut = lastSpace > TITLE_MAX_LENGTH / 2 ? lastSpace : TITLE_MAX_LENGTH
  return `${trimmed.slice(0, cut).trimEnd()}…`
}

function ndjsonResponse(source: AsyncGenerator<unknown>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await source.next()
      if (done) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
    },
    async cancel() {
      await source.return?.(undefined)
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}

async function* singleEvent(event: ChatEvent): AsyncGenerator<ChatEvent> {
  yield event
}

interface PersistContext {
  conversationId: string
  conversationTitle: string | null
  userContent: string
}

/**
 * Wraps the raw `runChatCompletion` event stream to persist the assistant's
 * reply (and, on the conversation's first turn, a derived title) once a
 * `done` event arrives, and to tag the `done` event with that title so the
 * client can update its UI without a re-fetch. All other events pass
 * through unchanged.
 */
async function* persistAndStream(
  source: AsyncGenerator<ChatEvent>,
  ctx: PersistContext,
): AsyncGenerator<ChatEvent | (ChatEvent & { title?: string | null })> {
  let accumulated = ''
  let sawDelta = false

  for await (const event of source) {
    if (event.type === 'delta') {
      accumulated += event.text
      sawDelta = true
      yield event
      continue
    }

    if (event.type === 'done') {
      let title = ctx.conversationTitle
      if (!title) {
        title = truncateTitle(ctx.userContent)
      }
      await db
        .update(aiConversations)
        .set({ title, updatedAt: new Date() })
        .where(eq(aiConversations.id, ctx.conversationId))

      await db.insert(aiMessages).values({
        conversationId: ctx.conversationId,
        role: 'assistant',
        content: accumulated,
        providerLabel: event.providerLabel,
        providerType: event.providerType,
        model: event.model,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        latencyMs: event.latencyMs,
        usedFallback: event.usedFallback,
      })

      yield { ...event, title }
      return
    }

    if (event.type === 'error') {
      // A mid-stream failure (after at least one delta) still leaves
      // partial text the user already saw — persist it so it isn't lost,
      // without provider/usage metrics since we don't know the final state.
      if (sawDelta && accumulated.trim()) {
        await db.insert(aiMessages).values({
          conversationId: ctx.conversationId,
          role: 'assistant',
          content: accumulated,
          usedFallback: false,
        })
      }
      yield event
      return
    }

    yield event
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let payload: { content?: string; mentionedSpecIds?: string[] }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const content = payload.content
  const mentionedSpecIds = Array.isArray(payload.mentionedSpecIds) ? payload.mentionedSpecIds : []

  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'O campo "content" é obrigatório.' }, { status: 400 })
  }

  let conversation: typeof aiConversations.$inferSelect | undefined
  try {
    const [row] = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).limit(1)
    conversation = row
  } catch {
    conversation = undefined
  }

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  // Persist the user's message before touching any provider, so the
  // conversation history survives even if generation subsequently fails.
  await db.insert(aiMessages).values({
    conversationId: id,
    role: 'user',
    content,
    mentionedSpecIds: mentionedSpecIds.length > 0 ? mentionedSpecIds : null,
  })

  const rateLimit = await checkTokenRateLimit(db)
  if (!rateLimit.ok) {
    return ndjsonResponse(singleEvent({ type: 'error', message: rateLimit.message }))
  }

  async function* buildAndStream(): AsyncGenerator<ChatEvent | (ChatEvent & { title?: string | null })> {
    yield { type: 'marker', text: 'Carregando contexto da especificação...' }

    let systemPrompt: string
    try {
      const mainParsed = await getSpecContext(conversation!.specSourceUrl, () =>
        fetchSpec(conversation!.specSourceUrl),
      )
      const summaries = [summarizeSpec(mainParsed)]

      for (const slug of mentionedSpecIds) {
        const spec = await getSpec(slug)
        if (!spec) continue
        const parsed = await getSpecContext(spec.sourceUrl, () => fetchSpec(spec.sourceUrl))
        summaries.push(summarizeSpec(parsed))
      }

      systemPrompt =
        'Você é um assistente que ajuda a entender a(s) API(s) documentada(s) abaixo. Responda em português. \n\n' +
        JSON.stringify(summaries)
    } catch {
      yield { type: 'error', message: 'Falha ao carregar o contexto da especificação para o chat.' }
      return
    }

    const historyRows = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, id))
      .orderBy(desc(aiMessages.createdAt))
      .limit(HISTORY_LIMIT)

    const history: ChatHistoryMessage[] = historyRows
      .reverse()
      .map((row) => ({ role: row.role === 'assistant' ? 'assistant' : 'user', content: row.content }))

    const eligibleProviders = await db
      .select()
      .from(aiProviders)
      .where(
        and(
          eq(aiProviders.enabled, true),
          or(isNull(aiProviders.cooldownUntil), lt(aiProviders.cooldownUntil, new Date())),
        ),
      )
      .orderBy(asc(aiProviders.priority))

    async function onProviderFailure(
      provider: AiProviderRow,
      _failureKind: FailureKind,
      cooldownUntil: Date | null,
    ) {
      await db
        .update(aiProviders)
        .set({
          failureCount: provider.failureCount + 1,
          lastFailureAt: new Date(),
          cooldownUntil,
          updatedAt: new Date(),
        })
        .where(eq(aiProviders.id, provider.id))
    }

    async function onProviderSuccess(provider: AiProviderRow) {
      await db
        .update(aiProviders)
        .set({ failureCount: 0, cooldownUntil: null, updatedAt: new Date() })
        .where(eq(aiProviders.id, provider.id))
    }

    const generator = runChatCompletion({
      providers: eligibleProviders,
      systemPrompt,
      history,
      onProviderFailure,
      onProviderSuccess,
    })

    yield* persistAndStream(generator, {
      conversationId: id,
      conversationTitle: conversation!.title,
      userContent: content!,
    })
  }

  return ndjsonResponse(buildAndStream())
}
