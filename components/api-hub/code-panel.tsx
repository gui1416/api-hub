'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  generateCodeSample,
  LANGUAGE_LABELS,
  type Language,
} from '@/lib/openapi/code-samples'
import { exampleFromSchema, prettyJson } from '@/lib/openapi/example'
import type { ParsedOperation } from '@/lib/openapi/types'
import { CodeBlock } from './code-block'
import { MethodBadge } from './method-badge'

const LANGUAGES: Language[] = ['curl', 'javascript', 'python', 'typescript']

function statusTone(status: string): string {
  if (status.startsWith('2')) return 'text-method-post'
  if (status.startsWith('3')) return 'text-method-put'
  if (status.startsWith('4') || status.startsWith('5'))
    return 'text-method-delete'
  return 'text-muted-foreground'
}

export function CodePanel({
  operation,
  baseUrl,
}: {
  operation: ParsedOperation
  baseUrl: string
}) {
  const [lang, setLang] = useState<Language>('curl')

  // Default values from schema examples for the displayed sample.
  const pathValues = useMemo(() => {
    const values: Record<string, string> = {}
    for (const p of operation.parameters) {
      if (p.in === 'path') {
        values[p.name] = String(p.example ?? p.schema?.example ?? `{${p.name}}`)
      }
    }
    return values
  }, [operation])

  const sample = useMemo(
    () => generateCodeSample(lang, operation, { baseUrl, pathValues }),
    [lang, operation, baseUrl, pathValues],
  )

  const responsesWithExamples = operation.responses.filter(
    (r) => r.schema || r.example !== undefined,
  )
  const [activeStatus, setActiveStatus] = useState(
    responsesWithExamples[0]?.status,
  )
  const activeResponse = responsesWithExamples.find(
    (r) => r.status === activeStatus,
  )
  const responseExample = activeResponse
    ? prettyJson(activeResponse.example ?? exampleFromSchema(activeResponse.schema))
    : null

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Requisição
          </span>
          <div className="flex items-center gap-2 truncate">
            <MethodBadge method={operation.method} />
            <code className="truncate font-mono text-[11px] text-muted-foreground">
              {operation.path}
            </code>
          </div>
        </div>
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                lang === l
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {LANGUAGE_LABELS[l]}
            </button>
          ))}
        </div>
        <CodeBlock code={sample} language="plain" maxHeight="320px" />
      </div>

      {responseExample && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
            <span className="px-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Resposta
            </span>
            <div className="ml-auto flex items-center gap-1">
              {responsesWithExamples.map((r) => (
                <button
                  key={r.status}
                  type="button"
                  onClick={() => setActiveStatus(r.status)}
                  className={cn(
                    'rounded-md px-2 py-1 font-mono text-xs font-medium transition-colors',
                    activeStatus === r.status
                      ? cn('bg-secondary', statusTone(r.status))
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r.status}
                </button>
              ))}
            </div>
          </div>
          <CodeBlock code={responseExample} language="json" maxHeight="320px" />
        </div>
      )}
    </div>
  )
}
