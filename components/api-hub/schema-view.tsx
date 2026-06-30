'use client'

import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { JSONSchema } from '@/lib/openapi/types'

function typeLabel(schema: JSONSchema): string {
  if (schema.allOf || schema.oneOf || schema.anyOf) {
    const which = schema.allOf ? 'allOf' : schema.oneOf ? 'oneOf' : 'anyOf'
    return which
  }
  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type
  if (type === 'array') {
    const itemType = schema.items
      ? Array.isArray(schema.items.type)
        ? schema.items.type.join(' | ')
        : schema.items.type ?? 'object'
      : 'any'
    return `${itemType}[]`
  }
  if (schema.format) return `${type ?? 'string'} · ${schema.format}`
  return type ?? 'object'
}

function PropertyRow({
  name,
  schema,
  required,
  depth,
}: {
  name: string
  schema: JSONSchema
  required: boolean
  depth: number
}) {
  const hasChildren =
    !!schema.properties ||
    (schema.type === 'array' && !!schema.items?.properties) ||
    !!schema.allOf ||
    !!schema.oneOf ||
    !!schema.anyOf
  const [open, setOpen] = useState(depth < 1)

  const childObject =
    schema.properties != null
      ? schema
      : schema.type === 'array' && schema.items?.properties
        ? schema.items
        : null

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <div className="flex items-start gap-2 py-2.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-0.5 inline-flex size-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            aria-label={open ? 'Recolher' : 'Expandir'}
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', open && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="mt-0.5 size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <code className="font-mono text-[13px] font-medium text-foreground">
              {name}
            </code>
            <span className="font-mono text-[11px] text-brand">
              {typeLabel(schema)}
            </span>
            {required && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-method-delete">
                obrigatório
              </span>
            )}
            {schema.deprecated && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground line-through">
                deprecated
              </span>
            )}
          </div>
          {schema.description && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {schema.description}
            </p>
          )}
          {Array.isArray(schema.enum) && schema.enum.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {schema.enum.map((value, i) => (
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
      </div>
      {hasChildren && open && childObject?.properties && (
        <div className="ml-4 border-l border-border pl-3">
          <SchemaProperties schema={childObject} />
        </div>
      )}
    </div>
  )
}

function SchemaProperties({ schema }: { schema: JSONSchema }) {
  const required = new Set(schema.required ?? [])
  const props = schema.properties ?? {}
  return (
    <div>
      {Object.entries(props).map(([name, prop]) => (
        <PropertyRow
          key={name}
          name={name}
          schema={prop}
          required={required.has(name)}
          depth={1}
        />
      ))}
    </div>
  )
}

export function SchemaView({ schema }: { schema: JSONSchema | undefined }) {
  if (!schema) {
    return (
      <p className="text-sm text-muted-foreground">Sem schema definido.</p>
    )
  }

  // Merge allOf for top-level display
  let effective = schema
  if (schema.allOf) {
    const merged: JSONSchema = { type: 'object', properties: {}, required: [] }
    for (const sub of schema.allOf) {
      if (sub.properties) Object.assign(merged.properties!, sub.properties)
      if (sub.required) merged.required!.push(...sub.required)
    }
    effective = merged
  }

  const isArray = effective.type === 'array'
  const target = isArray && effective.items ? effective.items : effective

  if (!target.properties) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 font-mono text-[13px] text-muted-foreground">
        {isArray ? 'array de ' : ''}
        <span className="text-brand">{typeLabel(target)}</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card px-4">
      {isArray && (
        <p className="border-b border-border/60 py-2.5 font-mono text-[12px] text-muted-foreground">
          array de objetos
        </p>
      )}
      <SchemaProperties schema={target} />
    </div>
  )
}
