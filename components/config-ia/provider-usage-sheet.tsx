'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { APP_TIMEZONE } from '@/lib/timezone'
import { cn } from '@/lib/utils'

type Range = '24h' | '7d' | '30d'

interface UsageRow {
  label: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  messages: number
  avgLatencyMs: number
}

interface ProviderUsage {
  range: Range
  provider: {
    id: string
    label: string
    model: string
    baseUrl: string
    enabled: boolean
    priority: number
    failureCount: number
    lastFailureAt: string | null
    cooldownUntil: string | null
    inCooldown: boolean
  }
  totals: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    messages: number
    avgLatencyMs: number
    fallbackMessages: number
  }
  byDay: UsageRow[]
  byModel: UsageRow[]
  byUser: UsageRow[]
}

const RANGE_OPTIONS: Array<{ value: Range; label: string }> = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
]

const numberFormat = new Intl.NumberFormat('pt-BR')

function formatDay(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${day}/${month}`
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Tokens por dia — série única (total de tokens), barras na cor da marca,
 * rótulo no título (sem legenda), tooltip por barra no hover.
 */
function DailyTokensChart({ rows }: { rows: UsageRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Sem uso no período.
      </p>
    )
  }
  const max = Math.max(...rows.map((row) => row.totalTokens), 1)

  return (
    <div>
      <div className="flex h-32 items-end gap-0.5 border-b border-border">
        {rows.map((row) => (
          <div key={row.label} className="group relative flex h-full min-w-0 flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max((row.totalTokens / max) * 100, row.totalTokens > 0 ? 2 : 0)}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md group-hover:block">
              <span className="font-medium">{formatDay(row.label)}</span>
              {' · '}
              {numberFormat.format(row.totalTokens)} tokens
              {' · '}
              {numberFormat.format(row.messages)} msg(s)
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{formatDay(rows[0].label)}</span>
        {rows.length > 1 && <span>{formatDay(rows[rows.length - 1].label)}</span>}
      </div>
    </div>
  )
}

function UsageTable({ title, rows, emptyText }: { title: string; rows: UsageRow[]; emptyText: string }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="px-2.5 py-2 font-medium">&nbsp;</th>
                <th className="px-2.5 py-2 text-right font-medium">Tokens</th>
                <th className="px-2.5 py-2 text-right font-medium">Msgs</th>
                <th className="px-2.5 py-2 text-right font-medium">Lat. média</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-0">
                  <td className="max-w-[180px] truncate px-2.5 py-2 text-foreground">{row.label}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-foreground">
                    {numberFormat.format(row.totalTokens)}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">
                    {numberFormat.format(row.messages)}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">
                    {row.avgLatencyMs}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function ProviderUsageSheet({
  providerId,
  open,
  onOpenChange,
}: {
  providerId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [range, setRange] = useState<Range>('7d')
  const [data, setData] = useState<ProviderUsage | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !providerId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/config-ia/providers/${providerId}/usage?range=${range}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, providerId, range])

  const provider = data?.provider

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto !w-full sm:!max-w-xl">
        <SheetHeader>
          <SheetTitle>{provider ? `Uso — ${provider.label}` : 'Uso do provider'}</SheetTitle>
          <SheetDescription>
            {provider ? `${provider.baseUrl} · ${provider.model}` : 'Relatório completo de uso.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    range === option.value
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {provider && (
              <div className="flex flex-wrap gap-1.5">
                {!provider.enabled && <Badge variant="secondary">Desabilitado</Badge>}
                {provider.inCooldown && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  >
                    Em cooldown até{' '}
                    {provider.cooldownUntil
                      ? new Date(provider.cooldownUntil).toLocaleTimeString('pt-BR', {
                          timeZone: APP_TIMEZONE,
                        })
                      : '—'}
                  </Badge>
                )}
                {provider.failureCount > 0 && (
                  <Badge variant="outline">
                    {provider.failureCount} falha(s) consecutiva(s)
                  </Badge>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Carregando relatório...
            </div>
          ) : !data ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Não foi possível carregar o relatório.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile
                  label="Tokens"
                  value={numberFormat.format(data.totals.totalTokens)}
                  hint={`${numberFormat.format(data.totals.promptTokens)} prompt · ${numberFormat.format(data.totals.completionTokens)} resposta`}
                />
                <StatTile label="Mensagens" value={numberFormat.format(data.totals.messages)} />
                <StatTile label="Latência média" value={`${data.totals.avgLatencyMs}ms`} />
                <StatTile
                  label="Fallbacks"
                  value={numberFormat.format(data.totals.fallbackMessages)}
                  hint="respostas via fallback"
                />
              </div>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Tokens por dia</h3>
                <DailyTokensChart rows={data.byDay} />
              </section>

              <UsageTable
                title="Por modelo"
                rows={data.byModel}
                emptyText="Sem uso por modelo no período."
              />
              <UsageTable
                title="Por usuário"
                rows={data.byUser}
                emptyText="Sem uso por usuário no período."
              />

              {provider?.lastFailureAt && (
                <p className="text-[11px] text-muted-foreground">
                  Última falha:{' '}
                  {new Date(provider.lastFailureAt).toLocaleString('pt-BR', {
                    timeZone: APP_TIMEZONE,
                  })}
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
