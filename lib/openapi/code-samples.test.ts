import { describe, expect, it } from 'vitest'
import { generateCodeSample } from './code-samples'
import type { ParsedOperation } from './types'

const baseOp: ParsedOperation = {
  id: 'get-pet',
  method: 'get',
  path: '/pets/{petId}',
  tags: ['pets'],
  parameters: [],
  responses: [],
}

const postOp: ParsedOperation = {
  id: 'create-pet',
  method: 'post',
  path: '/pets',
  tags: ['pets'],
  parameters: [],
  responses: [],
  requestBody: {
    required: true,
    contentType: 'application/json',
    schema: { type: 'object', properties: { name: { type: 'string' } } },
  },
}

describe('generateCodeSample', () => {
  it('substitutes path params and appends a query string (curl)', () => {
    const sample = generateCodeSample('curl', baseOp, {
      baseUrl: 'https://api.example.com/',
      pathValues: { petId: '42' },
      queryValues: { verbose: 'true' },
    })
    expect(sample).toContain('curl -X GET "https://api.example.com/pets/42?verbose=true"')
  })

  it('leaves unresolved path params as :name placeholders', () => {
    const sample = generateCodeSample('curl', baseOp, { baseUrl: 'https://api.example.com' })
    expect(sample).toContain('/pets/:petId')
  })

  it('includes a JSON body for requests with a request body (javascript)', () => {
    const sample = generateCodeSample('javascript', postOp, {
      baseUrl: 'https://api.example.com',
    })
    expect(sample).toContain('body: JSON.stringify(')
    expect(sample).toContain('"name": "string"')
    expect(sample).toContain('Content-Type')
  })

  it('omits the body block for operations without a request body', () => {
    const sample = generateCodeSample('javascript', baseOp, {
      baseUrl: 'https://api.example.com',
    })
    expect(sample).not.toContain('body:')
  })

  it('generates a python sample with headers and json payload', () => {
    const sample = generateCodeSample('python', postOp, {
      baseUrl: 'https://api.example.com',
      headerValues: { 'X-Api-Key': 'secret' },
    })
    expect(sample).toContain('import requests')
    expect(sample).toContain('headers = {')
    expect(sample).toContain('"X-Api-Key": "secret"')
    expect(sample).toContain('requests.post(')
  })

  it('generates a typescript sample with a response.ok check', () => {
    const sample = generateCodeSample('typescript', baseOp, {
      baseUrl: 'https://api.example.com',
    })
    expect(sample).toContain('const response: Response')
    expect(sample).toContain('if (!response.ok)')
  })

  it('prefers an explicit ctx.body over a generated example', () => {
    const sample = generateCodeSample('curl', postOp, {
      baseUrl: 'https://api.example.com',
      body: '{"custom":true}',
    })
    expect(sample).toContain(`-d '{"custom":true}'`)
  })

  it('drops empty/null query values', () => {
    const sample = generateCodeSample('curl', baseOp, {
      baseUrl: 'https://api.example.com',
      pathValues: { petId: '1' },
      queryValues: { empty: '', kept: 'yes' },
    })
    expect(sample).not.toContain('empty=')
    expect(sample).toContain('kept=yes')
  })
})
