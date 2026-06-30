import { slugify } from '@/lib/slug'
import type {
  HttpMethod,
  JSONSchema,
  OpenAPIServer,
  ParsedOperation,
  ParsedParameter,
  ParsedRequestBody,
  ParsedResponse,
  ParsedSpec,
  SecurityScheme,
  TagGroup,
} from './types'

const HTTP_METHODS: HttpMethod[] = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Resolve a single local $ref (e.g. "#/components/schemas/Pet") against the
 * root document. Returns the original node if it cannot be resolved.
 */
export function resolveRef(
  root: Record<string, unknown>,
  ref: string,
): Record<string, unknown> | undefined {
  if (!ref.startsWith('#/')) return undefined
  const segments = ref
    .slice(2)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  let current: unknown = root
  for (const segment of segments) {
    if (!isObject(current)) return undefined
    current = current[segment]
  }
  return isObject(current) ? current : undefined
}

/**
 * Recursively resolve $ref nodes within a schema so consumers get a fully
 * dereferenced object. Guards against circular references using a visited set.
 */
export function resolveSchema(
  root: Record<string, unknown>,
  schema: JSONSchema | undefined,
  seen: Set<string> = new Set(),
  depth = 0,
): JSONSchema | undefined {
  if (!schema || depth > 12) return schema
  if (schema.$ref) {
    const ref = schema.$ref
    if (seen.has(ref)) {
      // circular — return a shallow marker
      const name = ref.split('/').pop()
      return { type: 'object', title: name, description: 'Circular reference' }
    }
    const resolved = resolveRef(root, ref) as JSONSchema | undefined
    if (!resolved) return schema
    const nextSeen = new Set(seen)
    nextSeen.add(ref)
    return resolveSchema(root, resolved, nextSeen, depth + 1)
  }

  const out: JSONSchema = { ...schema }

  if (schema.properties) {
    const props: Record<string, JSONSchema> = {}
    for (const [key, value] of Object.entries(schema.properties)) {
      props[key] = resolveSchema(root, value, seen, depth + 1) ?? value
    }
    out.properties = props
  }
  if (schema.items) {
    out.items = resolveSchema(root, schema.items, seen, depth + 1)
  }
  for (const comb of ['allOf', 'oneOf', 'anyOf'] as const) {
    if (Array.isArray(schema[comb])) {
      out[comb] = schema[comb]!.map(
        (s) => resolveSchema(root, s, seen, depth + 1) ?? s,
      )
    }
  }
  if (isObject(schema.additionalProperties)) {
    out.additionalProperties = resolveSchema(
      root,
      schema.additionalProperties as JSONSchema,
      seen,
      depth + 1,
    )
  }
  return out
}

function pickContent(
  root: Record<string, unknown>,
  content: Record<string, unknown> | undefined,
): { contentType: string; schema?: JSONSchema; example?: unknown } | undefined {
  if (!content) return undefined
  const preferred =
    content['application/json'] ??
    content[Object.keys(content)[0]] ??
    undefined
  if (!isObject(preferred)) return undefined
  const contentType = content['application/json']
    ? 'application/json'
    : Object.keys(content)[0]
  const schema = resolveSchema(root, preferred.schema as JSONSchema)
  let example = preferred.example
  if (example === undefined && isObject(preferred.examples)) {
    const first = Object.values(preferred.examples)[0]
    if (isObject(first)) example = first.value
  }
  return { contentType, schema, example }
}

function parseParameters(
  root: Record<string, unknown>,
  params: unknown[],
): ParsedParameter[] {
  const out: ParsedParameter[] = []
  for (const raw of params) {
    let param = raw as Record<string, unknown>
    if (param.$ref) {
      const resolved = resolveRef(root, param.$ref as string)
      if (resolved) param = resolved
    }
    if (!param.name || !param.in) continue
    out.push({
      name: String(param.name),
      in: param.in as ParsedParameter['in'],
      description: param.description as string | undefined,
      required: Boolean(param.required),
      deprecated: Boolean(param.deprecated),
      schema: resolveSchema(root, param.schema as JSONSchema),
      example: param.example,
    })
  }
  return out
}

function parseResponses(
  root: Record<string, unknown>,
  responses: Record<string, unknown> | undefined,
): ParsedResponse[] {
  if (!responses) return []
  const out: ParsedResponse[] = []
  for (const [status, raw] of Object.entries(responses)) {
    let res = raw as Record<string, unknown>
    if (res.$ref) {
      const resolved = resolveRef(root, res.$ref as string)
      if (resolved) res = resolved
    }
    const content = pickContent(
      root,
      res.content as Record<string, unknown> | undefined,
    )
    out.push({
      status,
      description: res.description as string | undefined,
      contentType: content?.contentType,
      schema: content?.schema,
      example: content?.example,
    })
  }
  return out.sort((a, b) => a.status.localeCompare(b.status))
}

function parseSecuritySchemes(
  root: Record<string, unknown>,
): SecurityScheme[] {
  const components = root.components as Record<string, unknown> | undefined
  const schemes = components?.securitySchemes as
    | Record<string, Record<string, unknown>>
    | undefined
  if (!schemes) return []
  return Object.entries(schemes).map(([key, value]) => ({
    key,
    type: value.type as string | undefined,
    scheme: value.scheme as string | undefined,
    name: value.name as string | undefined,
    in: value.in as string | undefined,
    bearerFormat: value.bearerFormat as string | undefined,
    description: value.description as string | undefined,
  }))
}

export function parseOpenAPI(doc: Record<string, unknown>): ParsedSpec {
  const root = doc
  const info = (root.info as ParsedSpec['info']) ?? {}
  const servers: OpenAPIServer[] = Array.isArray(root.servers)
    ? (root.servers as OpenAPIServer[])
    : []

  // Swagger 2.0 fallback for base URL
  if (servers.length === 0 && root.host) {
    const scheme = Array.isArray(root.schemes)
      ? (root.schemes as string[])[0]
      : 'https'
    servers.push({
      url: `${scheme}://${root.host}${root.basePath ?? ''}`,
    })
  }

  const paths = (root.paths as Record<string, Record<string, unknown>>) ?? {}
  const operations: ParsedOperation[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) continue
    const pathParams = Array.isArray(pathItem.parameters)
      ? (pathItem.parameters as unknown[])
      : []

    for (const method of HTTP_METHODS) {
      const op = pathItem[method]
      if (!isObject(op)) continue

      const opParams = Array.isArray(op.parameters)
        ? (op.parameters as unknown[])
        : []
      const allParams = parseParameters(root, [...pathParams, ...opParams])

      let requestBody: ParsedRequestBody | undefined
      if (isObject(op.requestBody)) {
        let rb = op.requestBody as Record<string, unknown>
        if (rb.$ref) {
          const resolved = resolveRef(root, rb.$ref as string)
          if (resolved) rb = resolved
        }
        const content = pickContent(
          root,
          rb.content as Record<string, unknown> | undefined,
        )
        if (content) {
          requestBody = {
            description: rb.description as string | undefined,
            required: Boolean(rb.required),
            contentType: content.contentType,
            schema: content.schema,
            example: content.example,
          }
        }
      }

      const tags = Array.isArray(op.tags) && op.tags.length
        ? (op.tags as string[])
        : ['default']

      const operationId = op.operationId as string | undefined

      operations.push({
        id: operationId
          ? slugify(operationId)
          : `${method}-${slugify(path)}`,
        method,
        path,
        summary: op.summary as string | undefined,
        description: op.description as string | undefined,
        operationId,
        deprecated: Boolean(op.deprecated),
        tags,
        parameters: allParams,
        requestBody,
        responses: parseResponses(
          root,
          op.responses as Record<string, unknown> | undefined,
        ),
        security: op.security as Record<string, string[]>[] | undefined,
      })
    }
  }

  // Group by tag, preserving declared tag order then alphabetical.
  const declaredTags = Array.isArray(root.tags)
    ? (root.tags as { name: string; description?: string }[])
    : []
  const tagOrder = new Map<string, number>()
  declaredTags.forEach((t, i) => tagOrder.set(t.name, i))
  const tagDescriptions = new Map<string, string | undefined>()
  declaredTags.forEach((t) => tagDescriptions.set(t.name, t.description))

  const groupMap = new Map<string, TagGroup>()
  for (const op of operations) {
    const tag = op.tags[0] ?? 'default'
    if (!groupMap.has(tag)) {
      groupMap.set(tag, {
        name: tag,
        description: tagDescriptions.get(tag),
        operations: [],
      })
    }
    groupMap.get(tag)!.operations.push(op)
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    const ai = tagOrder.has(a.name) ? tagOrder.get(a.name)! : Infinity
    const bi = tagOrder.has(b.name) ? tagOrder.get(b.name)! : Infinity
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name)
  })

  return {
    info,
    servers,
    groups,
    operations,
    securitySchemes: parseSecuritySchemes(root),
    raw: root,
  }
}
