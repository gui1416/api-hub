import { exampleFromSchema, prettyJson } from './example'
import type { ParsedOperation } from './types'

export type Language = 'curl' | 'javascript' | 'python' | 'typescript'

export interface CodeSampleContext {
  baseUrl: string
  /** Values to substitute for path params, keyed by name. */
  pathValues?: Record<string, string>
  /** Query params to include, keyed by name. */
  queryValues?: Record<string, string>
  /** Header values, keyed by name. */
  headerValues?: Record<string, string>
  /** Raw JSON body string, if any. */
  body?: string
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  curl: 'cURL',
  javascript: 'JavaScript',
  python: 'Python',
  typescript: 'TypeScript',
}

function resolvePath(
  path: string,
  pathValues: Record<string, string> = {},
): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    return pathValues[name] ?? `:${name}`
  })
}

function buildUrl(op: ParsedOperation, ctx: CodeSampleContext): string {
  const base = ctx.baseUrl.replace(/\/$/, '')
  const path = resolvePath(op.path, ctx.pathValues)
  const query = ctx.queryValues
    ? Object.entries(ctx.queryValues).filter(([, v]) => v !== '' && v != null)
    : []
  const qs = query.length
    ? '?' +
      query
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        )
        .join('&')
    : ''
  return `${base}${path}${qs}`
}

function defaultBody(op: ParsedOperation): string | undefined {
  if (!op.requestBody?.schema) return undefined
  const example =
    op.requestBody.example ?? exampleFromSchema(op.requestBody.schema)
  return prettyJson(example)
}

function collectHeaders(
  op: ParsedOperation,
  ctx: CodeSampleContext,
): Record<string, string> {
  const headers: Record<string, string> = {}
  if (op.requestBody) headers['Content-Type'] = op.requestBody.contentType
  if (ctx.headerValues) {
    for (const [k, v] of Object.entries(ctx.headerValues)) {
      if (v) headers[k] = v
    }
  }
  return headers
}

export function generateCodeSample(
  language: Language,
  op: ParsedOperation,
  ctx: CodeSampleContext,
): string {
  const url = buildUrl(op, ctx)
  const method = op.method.toUpperCase()
  const headers = collectHeaders(op, ctx)
  const body = ctx.body ?? defaultBody(op)

  switch (language) {
    case 'curl':
      return curlSample(method, url, headers, body)
    case 'javascript':
      return jsSample(method, url, headers, body)
    case 'python':
      return pythonSample(method, url, headers, body)
    case 'typescript':
      return tsSample(method, url, headers, body)
  }
}

function curlSample(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): string {
  const lines = [`curl -X ${method} "${url}"`]
  for (const [k, v] of Object.entries(headers)) {
    lines.push(`  -H "${k}: ${v}"`)
  }
  if (body) {
    const compact = safeCompact(body)
    lines.push(`  -d '${compact}'`)
  }
  return lines.join(' \\\n')
}

function jsSample(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): string {
  const options: string[] = [`  method: "${method}"`]
  if (Object.keys(headers).length) {
    options.push(`  headers: ${prettyJson(headers).replace(/\n/g, '\n  ')}`)
  }
  if (body) {
    options.push(`  body: JSON.stringify(${indent(body, 2)})`)
  }
  return `const response = await fetch("${url}", {
${options.join(',\n')}
})

const data = await response.json()
console.log(data)`
}

function tsSample(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): string {
  const options: string[] = [`  method: "${method}"`]
  if (Object.keys(headers).length) {
    options.push(`  headers: ${prettyJson(headers).replace(/\n/g, '\n  ')}`)
  }
  if (body) {
    options.push(`  body: JSON.stringify(${indent(body, 2)})`)
  }
  return `const response: Response = await fetch("${url}", {
${options.join(',\n')}
})

if (!response.ok) {
  throw new Error(\`Request failed: \${response.status}\`)
}

const data = await response.json()
console.log(data)`
}

function pythonSample(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): string {
  const lines = ['import requests', '']
  if (Object.keys(headers).length) {
    lines.push(`headers = ${pyDict(headers)}`)
  }
  if (body) {
    lines.push(`payload = ${indent(body, 0)}`)
  }
  const args = [`"${url}"`]
  if (Object.keys(headers).length) args.push('headers=headers')
  if (body) args.push('json=payload')
  lines.push('')
  lines.push(`response = requests.${method.toLowerCase()}(${args.join(', ')})`)
  lines.push('print(response.json())')
  return lines.join('\n')
}

function pyDict(obj: Record<string, string>): string {
  const entries = Object.entries(obj).map(
    ([k, v]) => `    "${k}": "${v}"`,
  )
  return `{\n${entries.join(',\n')}\n}`
}

function indent(text: string, spaces: number): string {
  if (spaces === 0) return text
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? line : pad + line))
    .join('\n')
}

function safeCompact(jsonString: string): string {
  try {
    return JSON.stringify(JSON.parse(jsonString))
  } catch {
    return jsonString.replace(/\n\s*/g, '')
  }
}
