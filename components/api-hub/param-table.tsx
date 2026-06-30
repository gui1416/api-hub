import type { JSONSchema, ParsedParameter } from '@/lib/openapi/types'

function typeOf(schema?: JSONSchema): string {
  if (!schema) return 'string'
  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type
  if (schema.format) return `${type ?? 'string'} · ${schema.format}`
  return type ?? 'string'
}

export function ParamTable({ params }: { params: ParsedParameter[] }) {
  if (params.length === 0) return null

  return (
    <div className="divide-y divide-border/60 rounded-lg border border-border bg-card px-4">
      {params.map((param) => (
        <div key={`${param.in}-${param.name}`} className="py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <code className="font-mono text-[13px] font-medium text-foreground">
              {param.name}
            </code>
            <span className="font-mono text-[11px] text-brand">
              {typeOf(param.schema)}
            </span>
            {param.required && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-method-delete">
                obrigatório
              </span>
            )}
            {param.deprecated && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground line-through">
                deprecated
              </span>
            )}
          </div>
          {param.description && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {param.description}
            </p>
          )}
          {Array.isArray(param.schema?.enum) && param.schema!.enum!.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {param.schema!.enum!.map((value, i) => (
                <code
                  key={i}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                >
                  {String(value)}
                </code>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
