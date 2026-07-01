import { describe, expect, it } from 'vitest'
import { exampleFromSchema, prettyJson } from './example'
import type { JSONSchema } from './types'

describe('exampleFromSchema', () => {
  it('returns null for an undefined schema', () => {
    expect(exampleFromSchema(undefined)).toBeNull()
  })

  it('prefers an explicit example over everything else', () => {
    const schema: JSONSchema = { type: 'string', example: 'explicit', default: 'default', enum: ['a'] }
    expect(exampleFromSchema(schema)).toBe('explicit')
  })

  it('falls back to default when there is no example', () => {
    const schema: JSONSchema = { type: 'string', default: 'the-default', enum: ['a'] }
    expect(exampleFromSchema(schema)).toBe('the-default')
  })

  it('falls back to the first enum value when there is no example/default', () => {
    const schema: JSONSchema = { type: 'string', enum: ['first', 'second'] }
    expect(exampleFromSchema(schema)).toBe('first')
  })

  it('builds an object from properties', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
    }
    expect(exampleFromSchema(schema)).toEqual({ name: 'string', age: 0 })
  })

  it('treats a schema with properties but no explicit type as an object', () => {
    const schema: JSONSchema = { properties: { ok: { type: 'boolean' } } }
    expect(exampleFromSchema(schema)).toEqual({ ok: true })
  })

  it('builds a single-item array from items', () => {
    const schema: JSONSchema = { type: 'array', items: { type: 'string' } }
    expect(exampleFromSchema(schema)).toEqual(['string'])
  })

  it('merges allOf object branches', () => {
    const schema: JSONSchema = {
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'integer' } } },
      ],
    }
    expect(exampleFromSchema(schema)).toEqual({ a: 'string', b: 0 })
  })

  it('takes the first branch of oneOf/anyOf', () => {
    const oneOf: JSONSchema = { oneOf: [{ type: 'string' }, { type: 'integer' }] }
    expect(exampleFromSchema(oneOf)).toBe('string')

    const anyOf: JSONSchema = { anyOf: [{ type: 'boolean' }, { type: 'string' }] }
    expect(exampleFromSchema(anyOf)).toBe(true)
  })

  it('uses minimum for integer/number types when present', () => {
    expect(exampleFromSchema({ type: 'integer', minimum: 5 })).toBe(5)
    expect(exampleFromSchema({ type: 'number', minimum: 1.5 })).toBe(1.5)
    expect(exampleFromSchema({ type: 'integer' })).toBe(0)
  })

  it('returns a format-specific placeholder for known string formats', () => {
    expect(exampleFromSchema({ type: 'string', format: 'date-time' })).toBe('2025-01-01T12:00:00Z')
    expect(exampleFromSchema({ type: 'string', format: 'date' })).toBe('2025-01-01')
    expect(exampleFromSchema({ type: 'string', format: 'email' })).toBe('user@example.com')
    expect(exampleFromSchema({ type: 'string', format: 'uuid' })).toBe(
      '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    )
    expect(exampleFromSchema({ type: 'string', format: 'uri' })).toBe('https://example.com')
    expect(exampleFromSchema({ type: 'string', format: 'binary' })).toBe('<binary>')
  })

  it('falls back to the schema title (lowercased) for unknown string formats', () => {
    expect(exampleFromSchema({ type: 'string', title: 'Pet Name' })).toBe('pet name')
  })

  it('falls back to a generic "string" placeholder with no title/format', () => {
    expect(exampleFromSchema({ type: 'string' })).toBe('string')
  })

  it('handles boolean and null types', () => {
    expect(exampleFromSchema({ type: 'boolean' })).toBe(true)
    expect(exampleFromSchema({ type: 'null' })).toBeNull()
  })

  it('returns null for an unknown/missing type', () => {
    expect(exampleFromSchema({})).toBeNull()
  })

  it('stops recursing past the depth cap to avoid infinite loops', () => {
    const cyclic: JSONSchema = { type: 'object' }
    cyclic.properties = { self: cyclic }
    expect(() => exampleFromSchema(cyclic)).not.toThrow()
  })
})

describe('prettyJson', () => {
  it('pretty-prints with 2-space indentation', () => {
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('falls back to String() for values that cannot be serialized', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(prettyJson(circular)).toBe(String(circular))
  })
})
