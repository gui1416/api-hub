import { beforeEach, describe, expect, it, vi } from 'vitest'

const streamTextMock = vi.hoisted(() => vi.fn())

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, streamText: streamTextMock }
})

import {
  classifyFailure,
  computeCooldown,
  isProviderEligible,
  runChatCompletion,
  type AiProviderRow,
} from './provider-client'
import { encrypt } from './crypto'

const TEST_KEY = Buffer.alloc(32, 9).toString('base64')

function makeProvider(overrides: Partial<AiProviderRow> = {}): AiProviderRow {
  return {
    id: overrides.id ?? 'provider-1',
    label: overrides.label ?? 'Groq',
    providerType: overrides.providerType ?? 'openai-compatible',
    baseUrl: overrides.baseUrl ?? 'https://api.groq.com/openai/v1',
    apiKeyEncrypted: overrides.apiKeyEncrypted ?? encrypt('sk-test'),
    apiKeyLast4: overrides.apiKeyLast4 ?? 'test',
    model: overrides.model ?? 'llama-3.1',
    priority: overrides.priority ?? 1,
    enabled: overrides.enabled ?? true,
    failureCount: overrides.failureCount ?? 0,
    lastFailureAt: overrides.lastFailureAt ?? null,
    cooldownUntil: overrides.cooldownUntil ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  }
}

/** Builds a fake `streamText` result: yields `chunks` then resolves usage. */
function successResult(chunks: string[], usage = { inputTokens: 10, outputTokens: 5 }) {
  return {
    textStream: (async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    })(),
    usage: Promise.resolve(usage),
  }
}

describe('isProviderEligible', () => {
  const now = new Date('2026-07-01T12:00:00Z')

  it('is eligible when enabled and no cooldown', () => {
    expect(isProviderEligible({ enabled: true, cooldownUntil: null }, now)).toBe(true)
  })

  it('is not eligible when disabled, regardless of cooldown', () => {
    expect(isProviderEligible({ enabled: false, cooldownUntil: null }, now)).toBe(false)
  })

  it('is not eligible while the cooldown is still in the future', () => {
    const cooldownUntil = new Date(now.getTime() + 60_000)
    expect(isProviderEligible({ enabled: true, cooldownUntil }, now)).toBe(false)
  })

  it('is eligible once the cooldown has elapsed', () => {
    const cooldownUntil = new Date(now.getTime() - 1)
    expect(isProviderEligible({ enabled: true, cooldownUntil }, now)).toBe(true)
  })

  it('is eligible exactly at the cooldown boundary', () => {
    expect(isProviderEligible({ enabled: true, cooldownUntil: now }, now)).toBe(true)
  })

  it('accepts a string cooldownUntil (e.g. straight from JSON)', () => {
    const future = new Date(now.getTime() + 60_000).toISOString()
    const past = new Date(now.getTime() - 60_000).toISOString()
    expect(isProviderEligible({ enabled: true, cooldownUntil: future }, now)).toBe(false)
    expect(isProviderEligible({ enabled: true, cooldownUntil: past }, now)).toBe(true)
  })
})

describe('computeCooldown', () => {
  const now = new Date('2026-07-01T12:00:00Z')

  it('auth failures cool down for 15 minutes', () => {
    const result = computeCooldown('auth', now)
    expect(result).toEqual(new Date(now.getTime() + 15 * 60 * 1000))
  })

  it('rate-limit failures honor Retry-After when provided', () => {
    const result = computeCooldown('rate-limit', now, 120)
    expect(result).toEqual(new Date(now.getTime() + 120 * 1000))
  })

  it('rate-limit failures default to 5 minutes without Retry-After', () => {
    const result = computeCooldown('rate-limit', now)
    expect(result).toEqual(new Date(now.getTime() + 5 * 60 * 1000))
  })

  it('rate-limit failures ignore a zero/negative Retry-After and fall back to the default', () => {
    expect(computeCooldown('rate-limit', now, 0)).toEqual(new Date(now.getTime() + 5 * 60 * 1000))
    expect(computeCooldown('rate-limit', now, -10)).toEqual(new Date(now.getTime() + 5 * 60 * 1000))
  })

  it('other failures do not open the circuit', () => {
    expect(computeCooldown('other', now)).toBeNull()
  })
})

describe('classifyFailure', () => {
  it('classifies a 401/403 Response as auth', () => {
    expect(classifyFailure(new Response(null, { status: 401 }), undefined)).toBe('auth')
    expect(classifyFailure(new Response(null, { status: 403 }), undefined)).toBe('auth')
  })

  it('classifies a 429 Response as rate-limit', () => {
    expect(classifyFailure(new Response(null, { status: 429 }), undefined)).toBe('rate-limit')
  })

  it('classifies any other Response status as other', () => {
    expect(classifyFailure(new Response(null, { status: 500 }), undefined)).toBe('other')
    expect(classifyFailure(new Response(null, { status: 200 }), undefined)).toBe('other')
  })

  it('classifies an APICallError-shaped error (statusCode field) without a Response', () => {
    expect(classifyFailure(undefined, { statusCode: 401 })).toBe('auth')
    expect(classifyFailure(undefined, { statusCode: 429 })).toBe('rate-limit')
    expect(classifyFailure(undefined, { statusCode: 500 })).toBe('other')
  })

  it('classifies a plain network error (no status anywhere) as other', () => {
    expect(classifyFailure(undefined, new Error('ECONNREFUSED'))).toBe('other')
    expect(classifyFailure(undefined, undefined)).toBe('other')
  })
})

describe('runChatCompletion', () => {
  beforeEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = TEST_KEY
    streamTextMock.mockReset()
  })

  it('emits error immediately when given an empty provider list', async () => {
    const events = []
    for await (const event of runChatCompletion({ providers: [], systemPrompt: 's', history: [] })) {
      events.push(event)
    }
    expect(events).toEqual([
      { type: 'error', message: 'Nenhum provider de IA disponível no momento.' },
    ])
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it('streams deltas and emits done with usedFallback: false for a single successful provider', async () => {
    streamTextMock.mockReturnValueOnce(successResult(['Olá', ', mundo']))
    const provider = makeProvider({ label: 'Groq' })

    const events = []
    for await (const event of runChatCompletion({
      providers: [provider],
      systemPrompt: 's',
      history: [],
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'delta', text: 'Olá' },
      { type: 'delta', text: ', mundo' },
      {
        type: 'done',
        providerLabel: 'Groq',
        providerType: 'openai-compatible',
        model: provider.model,
        promptTokens: 10,
        completionTokens: 5,
        latencyMs: expect.any(Number),
        usedFallback: false,
      },
    ])
  })

  it('emits a marker and falls back to the next provider when the first fails before any delta', async () => {
    streamTextMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('unauthorized'), { statusCode: 401 })
    })
    streamTextMock.mockReturnValueOnce(successResult(['ok']))

    const failing = makeProvider({ id: 'p1', label: 'Failing', priority: 1 })
    const backup = makeProvider({ id: 'p2', label: 'Backup', priority: 2 })

    const onProviderFailure = vi.fn().mockResolvedValue(undefined)
    const onProviderSuccess = vi.fn().mockResolvedValue(undefined)

    const events = []
    for await (const event of runChatCompletion({
      providers: [failing, backup],
      systemPrompt: 's',
      history: [],
      onProviderFailure,
      onProviderSuccess,
    })) {
      events.push(event)
    }

    expect(events[0]).toEqual({ type: 'marker', text: 'Failing falhou, tentando Backup...' })
    expect(events[1]).toEqual({ type: 'delta', text: 'ok' })
    expect(events[2]).toMatchObject({ type: 'done', providerLabel: 'Backup', usedFallback: true })

    expect(onProviderFailure).toHaveBeenCalledTimes(1)
    expect(onProviderFailure).toHaveBeenCalledWith(failing, 'auth', expect.any(Date))
    expect(onProviderSuccess).toHaveBeenCalledWith(backup)
  })

  it("uses the generic 'próximo provider disponível' phrase in the marker when there is no next provider", async () => {
    streamTextMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const only = makeProvider({ label: 'Solo' })

    const events = []
    for await (const event of runChatCompletion({ providers: [only], systemPrompt: 's', history: [] })) {
      events.push(event)
    }

    expect(events[0]).toEqual({
      type: 'marker',
      text: 'Solo falhou, tentando próximo provider disponível...',
    })
    expect(events[1]).toEqual({
      type: 'error',
      message: 'Todos os providers de IA falharam. Tente novamente mais tarde.',
    })
  })

  it('emits a final error when every provider fails before any delta', async () => {
    streamTextMock.mockImplementation(() => {
      throw new Error('down')
    })

    const providers = [makeProvider({ id: 'p1', label: 'A' }), makeProvider({ id: 'p2', label: 'B' })]
    const events = []
    for await (const event of runChatCompletion({ providers, systemPrompt: 's', history: [] })) {
      events.push(event)
    }

    expect(events.filter((e) => e.type === 'marker')).toHaveLength(2)
    expect(events.at(-1)).toEqual({
      type: 'error',
      message: 'Todos os providers de IA falharam. Tente novamente mais tarde.',
    })
  })

  it('stops and emits a terminal error (no fallback) when a provider fails mid-stream after a delta', async () => {
    streamTextMock.mockReturnValueOnce({
      textStream: (async function* () {
        yield 'partial'
        throw new Error('connection reset')
      })(),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    })
    // A second provider is present but must never be tried.
    streamTextMock.mockReturnValueOnce(successResult(['should not be reached']))

    const first = makeProvider({ id: 'p1', label: 'First' })
    const second = makeProvider({ id: 'p2', label: 'Second' })

    const events = []
    for await (const event of runChatCompletion({
      providers: [first, second],
      systemPrompt: 's',
      history: [],
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'delta', text: 'partial' },
      { type: 'error', message: 'A resposta foi interrompida: falha no provider.' },
    ])
    expect(streamTextMock).toHaveBeenCalledTimes(1)
  })
})
