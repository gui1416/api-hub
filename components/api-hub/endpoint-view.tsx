'use client'

import { cn } from '@/lib/utils'
import type {
  ParsedOperation,
  ParsedSpec,
} from '@/lib/openapi/types'
import { useSession } from '@/components/session-provider'
import { CodePanel } from './code-panel'
import { MethodBadge } from './method-badge'
import { ParamTable } from './param-table'
import { SchemaView } from './schema-view'
import { TryIt } from './try-it'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  )
}

function statusTone(status: string): string {
  if (status.startsWith('2')) return 'text-method-post'
  if (status.startsWith('3')) return 'text-method-put'
  if (status.startsWith('4') || status.startsWith('5'))
    return 'text-method-delete'
  return 'text-muted-foreground'
}

function resolveBaseUrl(spec: ParsedSpec, sourceUrl: string | null): string {
  const declared = spec.servers[0]?.url
  if (declared) return declared

  if (sourceUrl) {
    try {
      return new URL(sourceUrl).origin
    } catch {
      // fall through to the placeholder below
    }
  }

  return 'https://api.example.com'
}

export function EndpointView({
  operation,
  spec,
  sourceUrl,
}: {
  operation: ParsedOperation
  spec: ParsedSpec
  sourceUrl: string | null
}) {
  const { me } = useSession()
  const canUseProxy = me?.permissions.includes('proxy.use') ?? false
  const baseUrl = resolveBaseUrl(spec, sourceUrl)
  const pathParams = operation.parameters.filter((p) => p.in === 'path')
  const queryParams = operation.parameters.filter((p) => p.in === 'query')
  const headerParams = operation.parameters.filter((p) => p.in === 'header')

  return (
    <div className="mx-auto grid max-w-[1400px] gap-x-12 gap-y-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:px-10">
      {/* Left: documentation */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {operation.tags[0] && (
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {operation.tags[0]}
            </span>
          )}
          {operation.deprecated && (
            <span className="rounded border border-method-delete/30 bg-method-delete/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-method-delete">
              deprecated
            </span>
          )}
        </div>
        <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-foreground">
          {operation.summary ?? operation.operationId ?? operation.path}
        </h1>

        <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <MethodBadge method={operation.method} size="md" />
          <code className="truncate font-mono text-[13px] text-foreground">
            {operation.path}
          </code>
        </div>

        {operation.description && (
          <p className="mt-5 text-pretty text-[15px] leading-relaxed text-muted-foreground">
            {operation.description}
          </p>
        )}

        {pathParams.length > 0 && (
          <section className="mt-8">
            <SectionTitle>Parâmetros de caminho</SectionTitle>
            <ParamTable params={pathParams} />
          </section>
        )}

        {queryParams.length > 0 && (
          <section className="mt-8">
            <SectionTitle>Parâmetros de query</SectionTitle>
            <ParamTable params={queryParams} />
          </section>
        )}

        {headerParams.length > 0 && (
          <section className="mt-8">
            <SectionTitle>Cabeçalhos</SectionTitle>
            <ParamTable params={headerParams} />
          </section>
        )}

        {operation.requestBody?.schema && (
          <section className="mt-8">
            <SectionTitle>
              Corpo da requisição
              {operation.requestBody.required && (
                <span className="ml-2 text-[11px] font-normal text-method-delete">
                  obrigatório
                </span>
              )}
            </SectionTitle>
            <SchemaView schema={operation.requestBody.schema} />
          </section>
        )}

        {operation.responses.length > 0 && (
          <section className="mt-8">
            <SectionTitle>Respostas</SectionTitle>
            <div className="space-y-4">
              {operation.responses.map((res) => (
                <div key={res.status}>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={cn(
                        'font-mono text-sm font-semibold',
                        statusTone(res.status),
                      )}
                    >
                      {res.status}
                    </span>
                    {res.description && (
                      <span className="text-[13px] text-muted-foreground">
                        {res.description}
                      </span>
                    )}
                  </div>
                  {res.schema && <SchemaView schema={res.schema} />}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Right: code + try it (sticky) */}
      <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-4">
          <CodePanel operation={operation} baseUrl={baseUrl} />
          {/* "Testar endpoint" é a ação proxy.use — sem ela o painel some
              (o middleware bloqueia /api/proxy de qualquer forma). */}
          {canUseProxy && (
            <TryIt
              operation={operation}
              baseUrl={baseUrl}
              securitySchemes={spec.securitySchemes}
            />
          )}
        </div>
      </div>
    </div>
  )
}
