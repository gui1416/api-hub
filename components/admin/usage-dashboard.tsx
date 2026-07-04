'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UsageRow {
  label: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  messages: number
  avgLatencyMs: number
}

interface UsageData {
  range: string
  byProvider: UsageRow[]
  byModel: UsageRow[]
  byUser: UsageRow[]
}

const RANGES = [
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
] as const

const numberFormat = new Intl.NumberFormat('pt-BR')

function formatTokens(value: number): string {
  return numberFormat.format(value)
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  )
}

// Barras horizontais de série única: hue única (brand), rótulo direto de
// categoria à esquerda e valor à direita em tinta de texto (nunca na cor da
// série), extremidade arredondada só no fim do dado, tooltip por barra no
// hover com o detalhamento prompt/completion.
function UsageBars({ title, rows }: { title: string; rows: UsageRow[] }) {
  const max = rows.reduce((acc, row) => Math.max(acc, row.totalTokens), 0)

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sem uso no período.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.label} className="group relative">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate text-foreground">{row.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatTokens(row.totalTokens)} tokens
                </span>
              </div>
              <div className="mt-1 h-2.5 w-full rounded-full bg-muted">
                <div
                  className="h-2.5 rounded-full bg-brand"
                  style={{ width: max > 0 ? `${Math.max((row.totalTokens / max) * 100, 1)}%` : '0%' }}
                />
              </div>
              <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md group-hover:block">
                <p className="font-medium">{row.label}</p>
                <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums text-muted-foreground">
                  <dt>Prompt</dt>
                  <dd className="text-right">{formatTokens(row.promptTokens)}</dd>
                  <dt>Completion</dt>
                  <dd className="text-right">{formatTokens(row.completionTokens)}</dd>
                  <dt>Mensagens</dt>
                  <dd className="text-right">{formatTokens(row.messages)}</dd>
                  <dt>Latência média</dt>
                  <dd className="text-right">{formatTokens(row.avgLatencyMs)} ms</dd>
                </dl>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function UsageDashboard() {
  const [range, setRange] = useState<string>('7d')
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/dashboard/usage?range=${range}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? 'Falha ao carregar os dados de uso.')
        }
        return res.json() as Promise<UsageData>
      })
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro inesperado.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range])

  const totals = (data?.byProvider ?? []).reduce(
    (acc, row) => ({
      tokens: acc.tokens + row.totalTokens,
      messages: acc.messages + row.messages,
    }),
    { tokens: 0, messages: 0 },
  )
  const avgLatency =
    data && data.byProvider.length > 0
      ? Math.round(
          data.byProvider.reduce((acc, row) => acc + row.avgLatencyMs * row.messages, 0) /
            Math.max(totals.messages, 1),
        )
      : 0

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 xl:px-6">
      <div className="mb-6">
        <h1 className="font-heading text-xl font-semibold text-foreground">Dashboard de uso de IA</h1>
        <p className="text-sm text-muted-foreground">
          Consumo de tokens do assistente por chave (provider), modelo e usuário.
        </p>
      </div>

      {/* Filtro de período: uma linha, acima dos gráficos */}
      <div className="mb-4 flex items-center gap-1.5">
        {RANGES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRange(option.value)}
            className={cn(
              'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
              range === option.value
                ? 'border-brand bg-brand/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {option.label}
          </button>
        ))}
        {loading && <LoaderCircle className="ml-1 size-4 animate-spin text-muted-foreground" />}
      </div>

      {error ? (
        <div className="rounded-lg border border-method-delete/30 bg-method-delete/10 px-4 py-3 text-sm text-method-delete">
          {error}
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatTile label="Tokens no período" value={formatTokens(totals.tokens)} />
            <StatTile label="Mensagens geradas" value={formatTokens(totals.messages)} />
            <StatTile
              label="Latência média"
              value={`${formatTokens(avgLatency)} ms`}
              detail="ponderada por mensagem"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <UsageBars title="Por chave (provider)" rows={data?.byProvider ?? []} />
            <UsageBars title="Por modelo" rows={data?.byModel ?? []} />
            <div className="lg:col-span-2">
              <UsageBars title="Por usuário" rows={data?.byUser ?? []} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
