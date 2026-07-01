import { describe, expect, it } from 'vitest'
import { parseOpenAPI, resolveRef, resolveSchema } from './parser'
import type { JSONSchema } from './types'

describe('resolveRef', () => {
  const root = {
    components: {
      schemas: {
        Pet: { type: 'object', properties: { name: { type: 'string' } } },
      },
    },
  }

  it('resolves a local $ref path', () => {
    expect(resolveRef(root, '#/components/schemas/Pet')).toEqual(
      root.components.schemas.Pet,
    )
  })

  it('returns undefined for a non-local $ref', () => {
    expect(resolveRef(root, 'https://example.com/schema.json')).toBeUndefined()
  })

  it('returns undefined when the path does not resolve to an object', () => {
    expect(resolveRef(root, '#/components/schemas/Missing')).toBeUndefined()
  })

  it('unescapes ~1 and ~0 JSON-pointer segments', () => {
    const withSlash = {
      components: { schemas: { 'a/b': { type: 'string' }, 'c~d': { type: 'number' } } },
    }
    expect(resolveRef(withSlash, '#/components/schemas/a~1b')).toEqual({ type: 'string' })
    expect(resolveRef(withSlash, '#/components/schemas/c~0d')).toEqual({ type: 'number' })
  })
})

describe('resolveSchema', () => {
  it('returns the schema unchanged when there is no $ref', () => {
    const schema: JSONSchema = { type: 'string' }
    expect(resolveSchema({}, schema)).toEqual(schema)
  })

  it('dereferences a top-level $ref', () => {
    const root = { components: { schemas: { Pet: { type: 'object' } } } }
    const result = resolveSchema(root, { $ref: '#/components/schemas/Pet' })
    expect(result).toEqual({ type: 'object' })
  })

  it('recursively dereferences nested properties', () => {
    const root = {
      components: {
        schemas: {
          Owner: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    }
    const schema: JSONSchema = {
      type: 'object',
      properties: { owner: { $ref: '#/components/schemas/Owner' } },
    }
    const result = resolveSchema(root, schema)
    expect(result?.properties?.owner).toEqual(root.components.schemas.Owner)
  })

  it('recursively dereferences array items', () => {
    const root = { components: { schemas: { Pet: { type: 'object' } } } }
    const schema: JSONSchema = { type: 'array', items: { $ref: '#/components/schemas/Pet' } }
    const result = resolveSchema(root, schema)
    expect(result?.items).toEqual({ type: 'object' })
  })

  it('recursively dereferences allOf/oneOf/anyOf branches', () => {
    const root = { components: { schemas: { A: { type: 'string' }, B: { type: 'number' } } } }
    const schema: JSONSchema = {
      allOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }],
    }
    const result = resolveSchema(root, schema)
    expect(result?.allOf).toEqual([{ type: 'string' }, { type: 'number' }])
  })

  it('guards against circular references with a marker object', () => {
    const root = {
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: { next: { $ref: '#/components/schemas/Node' } },
          },
        },
      },
    }
    const result = resolveSchema(root, { $ref: '#/components/schemas/Node' })
    const next = result?.properties?.next
    expect(next?.description).toBe('Circular reference')
    expect(next?.title).toBe('Node')
  })

  it('returns the original $ref schema when it cannot be resolved', () => {
    const schema: JSONSchema = { $ref: '#/components/schemas/Missing' }
    expect(resolveSchema({}, schema)).toEqual(schema)
  })

  it('stops recursing past the depth cap', () => {
    expect(() => {
      let schema: JSONSchema = { type: 'string' }
      for (let i = 0; i < 20; i++) {
        schema = { type: 'object', properties: { child: schema } }
      }
      resolveSchema({}, schema)
    }).not.toThrow()
  })
})

function baseSpec(overrides: Record<string, unknown> = {}) {
  return {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {},
    ...overrides,
  }
}

describe('parseOpenAPI', () => {
  it('extracts info and servers', () => {
    const spec = baseSpec({ servers: [{ url: 'https://api.example.com' }] })
    const result = parseOpenAPI(spec)
    expect(result.info).toEqual({ title: 'Test API', version: '1.0.0' })
    expect(result.servers).toEqual([{ url: 'https://api.example.com' }])
  })

  it('synthesizes a server from Swagger 2.0 host/basePath/schemes', () => {
    const spec = baseSpec({
      host: 'api.example.com',
      basePath: '/v1',
      schemes: ['https'],
    })
    const result = parseOpenAPI(spec)
    expect(result.servers).toEqual([{ url: 'https://api.example.com/v1' }])
  })

  it('parses a basic operation with path and query parameters', () => {
    const spec = baseSpec({
      paths: {
        '/pets/{petId}': {
          get: {
            operationId: 'getPet',
            summary: 'Get a pet',
            tags: ['pets'],
            parameters: [
              { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
              { name: 'verbose', in: 'query', schema: { type: 'boolean' } },
            ],
            responses: {
              '200': { description: 'OK' },
            },
          },
        },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations).toHaveLength(1)
    const op = result.operations[0]
    expect(op.id).toBe('getpet')
    expect(op.method).toBe('get')
    expect(op.path).toBe('/pets/{petId}')
    expect(op.parameters).toHaveLength(2)
    expect(op.parameters[0]).toMatchObject({ name: 'petId', in: 'path', required: true })
    expect(op.parameters[1]).toMatchObject({ name: 'verbose', in: 'query', required: false })
  })

  it('falls back to method-path slug when operationId is absent', () => {
    const spec = baseSpec({
      paths: { '/pets': { get: { responses: {} } } },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].id).toBe('get-pets')
  })

  it('merges path-level and operation-level parameters', () => {
    const spec = baseSpec({
      paths: {
        '/pets/{petId}': {
          parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
          get: {
            parameters: [{ name: 'verbose', in: 'query', schema: { type: 'boolean' } }],
            responses: {},
          },
        },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].parameters.map((p) => p.name)).toEqual(['petId', 'verbose'])
  })

  it('resolves a $ref parameter', () => {
    const spec = baseSpec({
      components: {
        parameters: {
          PetId: { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
        },
      },
      paths: {
        '/pets/{petId}': {
          get: { parameters: [{ $ref: '#/components/parameters/PetId' }], responses: {} },
        },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].parameters[0]).toMatchObject({ name: 'petId', in: 'path' })
  })

  it('skips parameters missing a name or "in"', () => {
    const spec = baseSpec({
      paths: {
        '/pets': {
          get: {
            parameters: [{ in: 'query' }, { name: 'onlyName' }],
            responses: {},
          },
        },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].parameters).toHaveLength(0)
  })

  it('parses a request body, preferring application/json content', () => {
    const spec = baseSpec({
      paths: {
        '/pets': {
          post: {
            requestBody: {
              required: true,
              content: {
                'text/plain': { schema: { type: 'string' } },
                'application/json': { schema: { type: 'object' }, example: { name: 'Rex' } },
              },
            },
            responses: {},
          },
        },
      },
    })
    const result = parseOpenAPI(spec)
    const rb = result.operations[0].requestBody
    expect(rb?.contentType).toBe('application/json')
    expect(rb?.required).toBe(true)
    expect(rb?.example).toEqual({ name: 'Rex' })
  })

  it('resolves a $ref request body', () => {
    const spec = baseSpec({
      components: {
        requestBodies: {
          PetBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
      paths: {
        '/pets': {
          post: { requestBody: { $ref: '#/components/requestBodies/PetBody' }, responses: {} },
        },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].requestBody?.contentType).toBe('application/json')
  })

  it('falls back to the first content type when application/json is absent', () => {
    const spec = baseSpec({
      paths: {
        '/pets': {
          post: {
            requestBody: { content: { 'application/xml': { schema: { type: 'string' } } } },
            responses: {},
          },
        },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].requestBody?.contentType).toBe('application/xml')
  })

  it('falls back to the first named example when there is no top-level example', () => {
    const spec = baseSpec({
      paths: {
        '/pets': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object' },
                  examples: { sample: { value: { name: 'Rex' } } },
                },
              },
            },
            responses: {},
          },
        },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].requestBody?.example).toEqual({ name: 'Rex' })
  })

  it('leaves requestBody undefined when there is no usable content', () => {
    const spec = baseSpec({
      paths: { '/pets': { post: { requestBody: {}, responses: {} } } },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].requestBody).toBeUndefined()
  })

  it('parses and sorts responses by status code', () => {
    const spec = baseSpec({
      paths: {
        '/pets': {
          get: {
            responses: {
              '404': { description: 'Not found' },
              '200': { description: 'OK', content: { 'application/json': { schema: { type: 'array' } } } },
            },
          },
        },
      },
    })
    const result = parseOpenAPI(spec)
    const statuses = result.operations[0].responses.map((r) => r.status)
    expect(statuses).toEqual(['200', '404'])
    expect(result.operations[0].responses[0].contentType).toBe('application/json')
  })

  it('resolves a $ref response', () => {
    const spec = baseSpec({
      components: {
        responses: { NotFound: { description: 'Not found' } },
      },
      paths: {
        '/pets': { get: { responses: { '404': { $ref: '#/components/responses/NotFound' } } } },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].responses[0].description).toBe('Not found')
  })

  it('defaults an operation with no tags into the "default" group', () => {
    const spec = baseSpec({ paths: { '/pets': { get: { responses: {} } } } })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].tags).toEqual(['default'])
    expect(result.groups.map((g) => g.name)).toEqual(['default'])
  })

  it('groups operations by their first tag and orders groups by declared tag order', () => {
    const spec = baseSpec({
      tags: [{ name: 'zebras', description: 'Z animals' }, { name: 'ants' }],
      paths: {
        '/zebras': { get: { tags: ['zebras'], responses: {} } },
        '/ants': { get: { tags: ['ants'], responses: {} } },
        '/misc': { get: { tags: ['misc'], responses: {} } },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.groups.map((g) => g.name)).toEqual(['zebras', 'ants', 'misc'])
    expect(result.groups[0].description).toBe('Z animals')
  })

  it('sorts undeclared tags alphabetically after declared ones', () => {
    const spec = baseSpec({
      tags: [{ name: 'declared' }],
      paths: {
        '/b': { get: { tags: ['b-tag'], responses: {} } },
        '/a': { get: { tags: ['a-tag'], responses: {} } },
        '/d': { get: { tags: ['declared'], responses: {} } },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.groups.map((g) => g.name)).toEqual(['declared', 'a-tag', 'b-tag'])
  })

  it('parses multiple HTTP methods on the same path', () => {
    const spec = baseSpec({
      paths: {
        '/pets': {
          get: { responses: {} },
          post: { responses: {} },
          delete: { responses: {} },
        },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations.map((o) => o.method).sort()).toEqual(['delete', 'get', 'post'])
  })

  it('ignores non-object path items and non-object operations', () => {
    const spec = baseSpec({
      paths: {
        '/broken': null,
        '/pets': { get: { responses: {} }, someMetadata: 'ignored' },
      },
    })
    expect(() => parseOpenAPI(spec)).not.toThrow()
    const result = parseOpenAPI(spec)
    expect(result.operations).toHaveLength(1)
  })

  it('parses security schemes from components', () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    })
    const result = parseOpenAPI(spec)
    expect(result.securitySchemes).toEqual([
      {
        key: 'bearerAuth',
        type: 'http',
        scheme: 'bearer',
        name: undefined,
        in: undefined,
        bearerFormat: 'JWT',
        description: undefined,
      },
    ])
  })

  it('returns an empty securitySchemes array when none are declared', () => {
    const result = parseOpenAPI(baseSpec())
    expect(result.securitySchemes).toEqual([])
  })

  it('marks deprecated operations', () => {
    const spec = baseSpec({
      paths: { '/pets': { get: { deprecated: true, responses: {} } } },
    })
    const result = parseOpenAPI(spec)
    expect(result.operations[0].deprecated).toBe(true)
  })
})
