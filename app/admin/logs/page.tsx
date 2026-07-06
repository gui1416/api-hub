import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AuditLogFilterBar } from '@/components/admin/audit-log-filter-bar'
import { loadAuditLogs } from '@/lib/admin/logs-data'
import { cn } from '@/lib/utils'

// Lê do banco a cada acesso — os logs mudam a todo momento (login, specs,
// proxy, ações administrativas).
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function param(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const actor = param(sp.actor).trim()
  const actionParam = param(sp.action) || 'all'
  const statusParam = param(sp.status) || 'all'
  const from = param(sp.from)
  const to = param(sp.to)
  const page = Math.max(1, Number(param(sp.page)) || 1)

  const { rows, total, actions } = await loadAuditLogs({
    actor: actor || undefined,
    action: actionParam !== 'all' ? actionParam : undefined,
    status: statusParam === 'success' || statusParam === 'failure' ? statusParam : undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function pageHref(target: number) {
    const params = new URLSearchParams()
    if (actor) params.set('actor', actor)
    if (actionParam !== 'all') params.set('action', actionParam)
    if (statusParam !== 'all') params.set('status', statusParam)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (target > 1) params.set('page', String(target))
    const qs = params.toString()
    return qs ? `/admin/logs?${qs}` : '/admin/logs'
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 xl:px-6">
      <div className="mb-4">
        <h1 className="font-heading text-xl font-semibold text-foreground">Logs de auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Login/logout, specs, proxy e ações administrativas — retidos por 1 ano.
        </p>
      </div>

      <AuditLogFilterBar
        actions={actions}
        action={actionParam}
        actor={actor}
        status={statusParam}
        from={from}
        to={to}
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Quando</th>
              <th className="px-3 py-2.5 font-medium">Ação</th>
              <th className="px-3 py-2.5 font-medium">Ator</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">IP</th>
              <th className="px-3 py-2.5 font-medium">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nenhum log encontrado para os filtros atuais.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border align-top last:border-0 hover:bg-muted/30"
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-3 py-2.5">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {row.action}
                  </code>
                </td>
                <td className="px-3 py-2.5 text-xs text-foreground">{row.actor}</td>
                <td className="px-3 py-2.5">
                  <Badge variant={row.status === 'success' ? 'secondary' : 'destructive'}>
                    {row.status === 'success' ? 'Sucesso' : 'Falha'}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.ip ?? '—'}</td>
                <td className="max-w-[280px] px-3 py-2.5">
                  {row.metadata ? (
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        ver metadata
                      </summary>
                      <pre className="mt-1.5 max-w-full overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-foreground">
                        {JSON.stringify(row.metadata, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Link
              href={pageHref(Math.max(1, page - 1))}
              aria-disabled={page <= 1}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium transition-colors',
                page <= 1
                  ? 'pointer-events-none opacity-50'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              <ChevronLeft className="size-3.5" />
              Anterior
            </Link>
            <span className="px-1 tabular-nums">
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(Math.min(totalPages, page + 1))}
              aria-disabled={page >= totalPages}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium transition-colors',
                page >= totalPages
                  ? 'pointer-events-none opacity-50'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              Próxima
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
