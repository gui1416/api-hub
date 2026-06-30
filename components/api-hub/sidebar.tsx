'use client'

import { Home, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ParsedOperation, ParsedSpec } from '@/lib/openapi/types'
import { MethodBadge } from './method-badge'

export function Sidebar({
  spec,
  selectedId,
  onSelect,
  onHome,
  className,
}: {
  spec: ParsedSpec
  selectedId: string | null
  onSelect: (op: ParsedOperation) => void
  onHome: () => void
  className?: string
}) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return spec.groups
    return spec.groups
      .map((g) => ({
        ...g,
        operations: g.operations.filter(
          (op) =>
            op.path.toLowerCase().includes(q) ||
            op.summary?.toLowerCase().includes(q) ||
            op.method.toLowerCase().includes(q) ||
            op.operationId?.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.operations.length > 0)
  }, [spec.groups, query])

  return (
    <nav
      className={cn(
        'flex h-full flex-col gap-3 overflow-hidden bg-sidebar',
        className,
      )}
    >
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar endpoints..."
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-6">
        <button
          type="button"
          onClick={onHome}
          className={cn(
            'mb-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
            selectedId === null
              ? 'bg-sidebar-accent text-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
          )}
        >
          <Home className="size-4" />
          Visão geral
        </button>

        {groups.map((group) => (
          <div key={group.name} className="mb-5">
            <h3 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.name}
            </h3>
            <ul className="space-y-0.5">
              {group.operations.map((op) => (
                <li key={op.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(op)}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      selectedId === op.id
                        ? 'bg-sidebar-accent text-foreground'
                        : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                    )}
                  >
                    <MethodBadge
                      method={op.method}
                      className="w-11 shrink-0"
                    />
                    <span
                      className={cn(
                        'truncate text-[13px]',
                        op.deprecated && 'line-through opacity-60',
                      )}
                    >
                      {op.summary ?? op.path}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {groups.length === 0 && (
          <p className="px-2 py-4 text-[13px] text-muted-foreground">
            Nenhum endpoint encontrado.
          </p>
        )}
      </div>
    </nav>
  )
}
