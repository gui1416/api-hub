import { describe, expect, it } from 'vitest'
import { extractSpecInfo } from './spec-info'

describe('extractSpecInfo', () => {
  it('extracts title, description and version from info', () => {
    const result = extractSpecInfo(
      {
        info: { title: 'Pet Store', description: 'A store for pets', version: '1.0.0' },
      },
      'fallback',
    )
    expect(result).toEqual({
      title: 'Pet Store',
      description: 'A store for pets',
      version: '1.0.0',
    })
  })

  it('falls back to the given title when info.title is missing', () => {
    const result = extractSpecInfo({}, 'fallback title')
    expect(result.title).toBe('fallback title')
  })

  it('falls back to the given title when info.title is an empty string', () => {
    const result = extractSpecInfo({ info: { title: '' } }, 'fallback title')
    expect(result.title).toBe('fallback title')
  })

  it('falls back to the given title when info.title is not a string', () => {
    const result = extractSpecInfo({ info: { title: 42 } }, 'fallback title')
    expect(result.title).toBe('fallback title')
  })

  it('returns null description/version when absent', () => {
    const result = extractSpecInfo({ info: { title: 'X' } }, 'fallback')
    expect(result.description).toBeNull()
    expect(result.version).toBeNull()
  })

  it('returns null description/version when not strings', () => {
    const result = extractSpecInfo(
      { info: { title: 'X', description: 123, version: {} } },
      'fallback',
    )
    expect(result.description).toBeNull()
    expect(result.version).toBeNull()
  })

  it('handles a completely missing info object', () => {
    const result = extractSpecInfo({}, 'fallback')
    expect(result).toEqual({ title: 'fallback', description: null, version: null })
  })
})
