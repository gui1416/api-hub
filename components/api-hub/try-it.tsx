'use client'

import { CircleAlert, LoaderCircle, Play } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { exampleFromSchema, prettyJson } from '@/lib/openapi/example'
import type {
  ParsedOperation,
  SecurityScheme,
} from '@/lib/openapi/types'
import { CodeBlock } from './code-block'

interface ResponseState {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  durationMs: number
}

function resolvePath(path: string, values: Record<string, string>): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) =>
    values[name] ? encodeURIComponent(values[name]) : `{${name}}`,
  )
}

function statusTone(status: number): string {
  if (status >= 200 && status < 300) return 'text-method-post'
  if (status >= 300 && status < 400) return 'text-method-put'
  if (status >= 400) return 'text-method-delete'
  return 'text-muted-foreground'
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <code className="font-mono">{label}</code>
        {required && <span className="text-method-delete">*</span>}
        {hint && (
          <span className="font-mono text-[10px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}

const inputClass =
  'h-8 w-full rounded-md border border-input bg-background px-2.5 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

export function TryIt({
  operation,
  baseUrl,
  securitySchemes,
}: {
  operation: ParsedOperation
  baseUrl: string
  securitySchemes: SecurityScheme[]
}) {
  const pathParams = operation.parameters.filter((p) => p.in === 'path')
  const queryParams = operation.parameters.filter((p) => p.in === 'query')
  const headerParams = operation.parameters.filter((p) => p.in === 'header')
  const authScheme = securitySchemes[0]

  const [server, setServer] = useState(baseUrl)
  const [pathValues, setPathValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pathParams.map((p) => [
        p.name,
        String(p.example ?? p.schema?.example ?? ''),
      ]),
    ),
  )
  const [queryValues, setQueryValues] = useState<Record<string, string>>({})
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({})
  const [token, setToken] = useState('')
  const [body, setBody] = useState(() =>
    operation.requestBody?.schema
      ? prettyJson(
          operation.requestBody.example ??
            exampleFromSchema(operation.requestBody.schema),
        )
      : '',
  )

  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<ResponseState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const previewUrl = useMemo(() => {
    const base = server.replace(/\/$/, '')
    const path = resolvePath(operation.path, pathValues)
    const qs = Object.entries(queryValues)
      .filter(([, v]) => v !== '')
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
      )
      .join('&')
    return `${base}${path}${qs ? `?${qs}` : ''}`
  }, [server, operation.path, pathValues, queryValues])

  async function send() {
    setLoading(true)
    setError(null)
    setResponse(null)

    const headers: Record<string, string> = {}
    if (operation.requestBody) {
      headers['Content-Type'] = operation.requestBody.contentType
    }
    for (const [k, v] of Object.entries(headerValues)) {
      if (v) headers[k] = v
    }
    if (token && authScheme) {
      if (authScheme.type === 'http' && authScheme.scheme === 'bearer') {
        headers['Authorization'] = `Bearer ${token}`
      } else if (authScheme.type === 'apiKey' && authScheme.in === 'header') {
        headers[authScheme.name ?? 'Authorization'] = token
      } else {
        headers['Authorization'] = token
      }
    }

    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: operation.method,
          url: previewUrl,
          headers,
          body: operation.requestBody ? body : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'A requisição falhou.')
      } else {
        setResponse(data as ResponseState)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro de rede inesperado.',
      )
    } finally {
      setLoading(false)
    }
  }

  const formattedBody = useMemo(() => {
    if (!response) return ''
    try {
      return prettyJson(JSON.parse(response.body))
    } catch {
      return response.body
    }
  }, [response])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Testar endpoint
        </span>
      </div>

      <div className="space-y-3.5 p-3">
        <Field label="Servidor">
          <select
            value={server}
            onChange={(e) => setServer(e.target.value)}
            className={cn(inputClass, 'cursor-pointer')}
          >
            {Array.from(new Set([baseUrl])).map((url) => (
              <option key={url} value={url}>
                {url}
              </option>
            ))}
          </select>
        </Field>

        {authScheme && (
          <Field
            label={
              authScheme.scheme === 'bearer'
                ? 'Bearer token'
                : (authScheme.name ?? 'API key')
            }
            hint="autenticação"
          >
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk_live_..."
              className={inputClass}
            />
          </Field>
        )}

        {pathParams.length > 0 && (
          <div className="space-y-2.5">
            {pathParams.map((p) => (
              <Field key={p.name} label={p.name} hint="path" required>
                <input
                  value={pathValues[p.name] ?? ''}
                  onChange={(e) =>
                    setPathValues((v) => ({ ...v, [p.name]: e.target.value }))
                  }
                  placeholder={String(p.example ?? '')}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        )}

        {queryParams.length > 0 && (
          <div className="space-y-2.5">
            {queryParams.map((p) => (
              <Field
                key={p.name}
                label={p.name}
                hint="query"
                required={p.required}
              >
                <input
                  value={queryValues[p.name] ?? ''}
                  onChange={(e) =>
                    setQueryValues((v) => ({ ...v, [p.name]: e.target.value }))
                  }
                  placeholder={String(p.example ?? p.schema?.example ?? '')}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        )}

        {headerParams.length > 0 && (
          <div className="space-y-2.5">
            {headerParams.map((p) => (
              <Field
                key={p.name}
                label={p.name}
                hint="header"
                required={p.required}
              >
                <input
                  value={headerValues[p.name] ?? ''}
                  onChange={(e) =>
                    setHeaderValues((v) => ({ ...v, [p.name]: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        )}

        {operation.requestBody && (
          <Field label="Body" hint={operation.requestBody.contentType}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
              rows={8}
              className={cn(
                inputClass,
                'h-auto resize-y py-2 leading-relaxed',
              )}
            />
          </Field>
        )}

        <div className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            <span className="font-semibold uppercase text-foreground">
              {operation.method}
            </span>{' '}
            {previewUrl}
          </p>
        </div>

        <button
          type="button"
          onClick={send}
          disabled={loading}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {loading ? 'Enviando...' : 'Enviar requisição'}
        </button>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-method-delete/30 bg-method-delete/10 px-3 py-2 text-[13px] text-method-delete">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {response && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <span className={cn('font-mono font-semibold', statusTone(response.status))}>
                {response.status} {response.statusText}
              </span>
              <span className="text-muted-foreground">
                {response.durationMs} ms
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <CodeBlock
                code={formattedBody || '(resposta vazia)'}
                language="json"
                maxHeight="280px"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
