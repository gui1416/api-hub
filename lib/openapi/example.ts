import type { JSONSchema } from './types'

/**
 * Produce a representative example value for a (already dereferenced) schema.
 * Honors explicit `example`/`default`/`enum` before falling back to
 * format/type-based placeholders.
 */
export function exampleFromSchema(
  schema: JSONSchema | undefined,
  depth = 0,
): unknown {
  if (!schema || depth > 8) return null

  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0]
  }

  // Combinators — take the first viable branch.
  const combinator = schema.allOf ?? schema.oneOf ?? schema.anyOf
  if (combinator && combinator.length > 0) {
    if (schema.allOf) {
      // merge all object branches
      const merged: Record<string, unknown> = {}
      for (const sub of schema.allOf) {
        const value = exampleFromSchema(sub, depth + 1)
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(merged, value)
        }
      }
      if (Object.keys(merged).length) return merged
    }
    return exampleFromSchema(combinator[0], depth + 1)
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type

  if (type === 'object' || schema.properties) {
    const obj: Record<string, unknown> = {}
    const props = schema.properties ?? {}
    for (const [key, value] of Object.entries(props)) {
      obj[key] = exampleFromSchema(value, depth + 1)
    }
    return obj
  }

  if (type === 'array') {
    return [exampleFromSchema(schema.items, depth + 1)]
  }

  switch (type) {
    case 'string':
      return exampleForStringFormat(schema)
    case 'integer':
      return schema.minimum ?? 0
    case 'number':
      return schema.minimum ?? 0
    case 'boolean':
      return true
    case 'null':
      return null
    default:
      return null
  }
}

function exampleForStringFormat(schema: JSONSchema): string {
  switch (schema.format) {
    case 'date-time':
      return '2025-01-01T12:00:00Z'
    case 'date':
      return '2025-01-01'
    case 'email':
      return 'user@example.com'
    case 'uuid':
      return '3fa85f64-5717-4562-b3fc-2c963f66afa6'
    case 'uri':
    case 'url':
      return 'https://example.com'
    case 'password':
      return '••••••••'
    case 'binary':
      return '<binary>'
    default:
      if (schema.title) return schema.title.toLowerCase()
      return 'string'
  }
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
