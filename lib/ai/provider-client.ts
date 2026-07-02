import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText } from 'ai'
import { decrypt } from '@/lib/ai/crypto'
import type { aiProviders } from '@/lib/db/schema'

export type AiProviderRow = typeof aiProviders.$inferSelect

export type FailureKind = 'auth' | 'rate-limit' | 'other'

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ChatEvent =
  | { type: 'marker'; text: string }
  | { type: 'delta'; text: string }
  | {
      type: 'done'
      providerLabel: string
      providerType: string
      model: string
      promptTokens: number
      completionTokens: number
      latencyMs: number
      usedFallback: boolean
    }
  | { type: 'error'; message: string }

export interface RunChatCompletionParams {
  /**
   * Providers to try, in order. The caller (the HTTP route) is responsible
   * for filtering to eligible providers (see `isProviderEligible`) and
   * ordering by `priority` before calling this — this function just walks
   * the list it's given.
   */
  providers: AiProviderRow[]
  systemPrompt: string
  history: ChatHistoryMessage[]
  /**
   * Called whenever a provider fails before emitting any delta, so the
   * caller can persist the cooldown/failure-count update. This module has
   * no knowledge of Drizzle/the DB — it just reports what happened.
   */
  onProviderFailure?: (
    provider: AiProviderRow,
    failureKind: FailureKind,
    cooldownUntil: Date | null,
  ) => Promise<void>
  /**
   * Called when a provider completes successfully, so the caller can reset
   * `failureCount`/`cooldownUntil`.
   */
  onProviderSuccess?: (provider: AiProviderRow) => Promise<void>
}

/**
 * A provider is eligible to be tried if it's enabled and either has no
 * cooldown set or its cooldown has already elapsed as of `now`.
 */
export function isProviderEligible(
  provider: { enabled: boolean; cooldownUntil: Date | string | null },
  now: Date,
): boolean {
  if (!provider.enabled) return false
  if (!provider.cooldownUntil) return true
  const cooldownUntil =
    provider.cooldownUntil instanceof Date ? provider.cooldownUntil : new Date(provider.cooldownUntil)
  return cooldownUntil.getTime() <= now.getTime()
}

const AUTH_COOLDOWN_MS = 15 * 60 * 1000
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000

/**
 * Computes how long a provider should be put in cooldown for, given the kind
 * of failure it just had:
 *  - `auth` (401/403): the credentials are (probably) bad, cooldown 15min.
 *  - `rate-limit` (429): honor `Retry-After` if the provider sent one,
 *    otherwise a conservative 5min default.
 *  - `other` (timeouts, 5xx, network errors, ...): transient — don't open
 *    the circuit, just skip this provider for the current request.
 */
export function computeCooldown(
  failureKind: FailureKind,
  now: Date,
  retryAfterSeconds?: number,
): Date | null {
  if (failureKind === 'auth') {
    return new Date(now.getTime() + AUTH_COOLDOWN_MS)
  }
  if (failureKind === 'rate-limit') {
    const ms =
      typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : DEFAULT_RATE_LIMIT_COOLDOWN_MS
    return new Date(now.getTime() + ms)
  }
  return null
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const maybe = error as { statusCode?: unknown; status?: unknown }
  if (typeof maybe.statusCode === 'number') return maybe.statusCode
  if (typeof maybe.status === 'number') return maybe.status
  return undefined
}

/**
 * Classifies a provider failure as `auth`, `rate-limit`, or `other`, based
 * on either an actual `Response` (status 401/403 → auth, 429 → rate-limit)
 * or a thrown error (e.g. the AI SDK's `APICallError`, which carries a
 * `statusCode` field with the same semantics).
 */
export function classifyFailure(response: Response | undefined, error: unknown): FailureKind {
  const status = response?.status ?? extractStatusCode(error)
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate-limit'
  return 'other'
}

function extractRetryAfterSeconds(response: Response | undefined, error: unknown): number | undefined {
  const fromHeader = (value: string | null | undefined): number | undefined => {
    if (!value) return undefined
    const seconds = Number(value)
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
  }

  if (response) {
    const fromResponse = fromHeader(response.headers.get('retry-after'))
    if (fromResponse !== undefined) return fromResponse
  }

  if (error && typeof error === 'object') {
    const maybe = error as { responseHeaders?: Record<string, string> }
    if (maybe.responseHeaders) {
      const fromError = fromHeader(maybe.responseHeaders['retry-after'] ?? maybe.responseHeaders['Retry-After'])
      if (fromError !== undefined) return fromError
    }
  }

  return undefined
}

/**
 * Runs a chat completion against `providers` in order, with fallback:
 *
 *  1. For each provider, decrypt its API key and stream a completion.
 *  2. The first successfully-received chunk "commits" to that provider —
 *     from then on every chunk is emitted as a `delta` event.
 *  3. If a provider fails *before* any chunk was emitted, classify the
 *     failure, compute a cooldown, report it via `onProviderFailure`, emit a
 *     `marker` event, and move on to the next provider.
 *  4. If a provider fails *after* at least one `delta` was emitted, emit a
 *     terminal `error` event and stop — no further providers are tried, to
 *     avoid concatenating/duplicating partial responses.
 *  5. If a provider completes successfully, report it via
 *     `onProviderSuccess`, emit a `done` event with usage/timing metadata,
 *     and stop.
 *  6. If every provider fails before any delta, emit a final `error` event.
 *  7. If `providers` is empty, emit `error` immediately.
 */
export async function* runChatCompletion(
  params: RunChatCompletionParams,
): AsyncGenerator<ChatEvent, void, undefined> {
  const { providers, systemPrompt, history, onProviderFailure, onProviderSuccess } = params

  if (providers.length === 0) {
    yield { type: 'error', message: 'Nenhum provider de IA disponível no momento.' }
    return
  }

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    const isFirstAttempt = index === 0
    const startedAt = Date.now()
    let emittedDelta = false

    try {
      const apiKey = decrypt(provider.apiKeyEncrypted)
      const client = createOpenAICompatible({
        name: provider.label,
        apiKey,
        baseURL: provider.baseUrl,
      })

      const result = streamText({
        model: client(provider.model),
        system: systemPrompt,
        messages: history.map((message) => ({ role: message.role, content: message.content })),
      })

      for await (const chunk of result.textStream) {
        emittedDelta = true
        yield { type: 'delta', text: chunk }
      }

      const usage = await result.usage
      const latencyMs = Date.now() - startedAt

      if (onProviderSuccess) {
        await onProviderSuccess(provider)
      }

      yield {
        type: 'done',
        providerLabel: provider.label,
        providerType: provider.providerType,
        model: provider.model,
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
        latencyMs,
        usedFallback: !isFirstAttempt,
      }
      return
    } catch (error) {
      if (emittedDelta) {
        yield { type: 'error', message: 'A resposta foi interrompida: falha no provider.' }
        return
      }

      const response = error instanceof Response ? error : undefined
      const failureKind = classifyFailure(response, error)
      const retryAfterSeconds = extractRetryAfterSeconds(response, error)
      const cooldownUntil = computeCooldown(failureKind, new Date(), retryAfterSeconds)

      if (onProviderFailure) {
        await onProviderFailure(provider, failureKind, cooldownUntil)
      }

      const nextProvider = providers[index + 1]
      const nextLabel = nextProvider ? nextProvider.label : 'próximo provider disponível'
      yield { type: 'marker', text: `${provider.label} falhou, tentando ${nextLabel}...` }
      // fall through to the next iteration / provider
    }
  }

  yield { type: 'error', message: 'Todos os providers de IA falharam. Tente novamente mais tarde.' }
}
