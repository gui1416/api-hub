import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('My Pet Store API')).toBe('my-pet-store-api')
  })

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(slugify('Foo   Bar---Baz!!')).toBe('foo-bar-baz')
  })

  it('strips leading and trailing hyphens', () => {
    expect(slugify('  --Leading and trailing--  ')).toBe('leading-and-trailing')
  })

  it('handles accented/non-ascii characters by dropping them', () => {
    expect(slugify('Ção Ñoño')).toBe('o-o-o')
  })

  it('returns an empty string for input with no alphanumeric characters', () => {
    expect(slugify('!!!')).toBe('')
  })

  it('leaves already-slug-like input untouched', () => {
    expect(slugify('already-a-slug')).toBe('already-a-slug')
  })

  it('preserves digits', () => {
    expect(slugify('API v2.0')).toBe('api-v2-0')
  })
})
