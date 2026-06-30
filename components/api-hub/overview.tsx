'use client'

import { ArrowRight, Lock, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ParsedOperation, ParsedSpec } from '@/lib/openapi/types'
import { CodeBlock } from './code-block'
import { MethodBadge } from './method-badge'

export function Overview({
  spec,
  onSelect,
}: {
  spec: ParsedSpec
  onSelect: (op: ParsedOperation) => void
}) {
  const baseUrl = spec.servers[0]?.url ?? ''

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 xl:px-10">
      <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-[11px] font-medium text-muted-foreground">
        v{spec.info.version ?? '1.0.0'}
      </span>
      <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-foreground">
        {spec.info.title ?? 'Referência da API'}
      </h1>
      {spec.info.description && (
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
          {spec.info.description}
        </p>
      )}

      {baseUrl && (
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <Server className="size-4 text-muted-foreground" />
            URL base
          </h2>
          <div className="space-y-2">
            {spec.servers.map((s) => (
              <div
                key={s.url}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <code className="font-mono text-[13px] text-foreground">
                  {s.url}
                </code>
                {s.description && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {spec.securitySchemes.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <Lock className="size-4 text-muted-foreground" />
            Autenticação
          </h2>
          {spec.securitySchemes.map((scheme) => (
            <div
              key={scheme.key}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <code className="font-mono text-[13px] font-medium text-foreground">
                  {scheme.key}
                </code>
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {[scheme.type, scheme.scheme].filter(Boolean).join(' · ')}
                </span>
              </div>
              {scheme.description && (
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {scheme.description}
                </p>
              )}
              {scheme.scheme === 'bearer' && (
                <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background">
                  <CodeBlock
                    code={`Authorization: Bearer <token>`}
                    language="plain"
                  />
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
          Endpoints
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {spec.operations.map((op, i) => (
            <button
              key={op.id}
              type="button"
              onClick={() => onSelect(op)}
              className={cn(
                'group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50',
                i !== spec.operations.length - 1 && 'border-b border-border/60',
              )}
            >
              <MethodBadge method={op.method} className="w-14 shrink-0" />
              <code className="truncate font-mono text-[13px] text-foreground">
                {op.path}
              </code>
              <span className="ml-auto hidden truncate text-xs text-muted-foreground sm:block">
                {op.summary}
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
