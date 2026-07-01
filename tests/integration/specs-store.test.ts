import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { specs } from '@/lib/db/schema'
import { deleteSpec, getSpec, listSpecs, saveSpec } from '@/lib/specs-store'

beforeEach(async () => {
  await db.delete(specs)
})

describe('saveSpec', () => {
  it('creates a new spec with a slug derived from the title', async () => {
    const { record, event } = await saveSpec({
      sourceUrl: 'https://example.com/a.json',
      title: 'My Pet Store',
      description: 'desc',
      version: '1.0.0',
    })
    expect(event).toBe('created')
    expect(record.slug).toBe('my-pet-store')
    expect(record.sourceUrl).toBe('https://example.com/a.json')
  })

  it('dedupes slugs derived from the same title with a numeric suffix', async () => {
    const first = await saveSpec({ sourceUrl: 'https://example.com/a.json', title: 'Pets' })
    const second = await saveSpec({ sourceUrl: 'https://example.com/b.json', title: 'Pets' })
    expect(first.record.slug).toBe('pets')
    expect(second.record.slug).toBe('pets-2')
  })

  it('syncs metadata in place and keeps the slug when sourceUrl matches and info changed', async () => {
    const created = await saveSpec({ sourceUrl: 'https://example.com/a.json', title: 'Old Title' })
    const updated = await saveSpec({
      sourceUrl: 'https://example.com/a.json',
      title: 'New Title',
      description: 'new desc',
    })
    expect(updated.event).toBe('updated')
    expect(updated.record.slug).toBe(created.record.slug)
    expect(updated.record.title).toBe('New Title')
    expect(updated.record.description).toBe('new desc')
  })

  it('is a no-op when nothing changed', async () => {
    await saveSpec({ sourceUrl: 'https://example.com/a.json', title: 'Same Title', version: '1' })
    const result = await saveSpec({
      sourceUrl: 'https://example.com/a.json',
      title: 'Same Title',
      version: '1',
    })
    expect(result.event).toBe('unchanged')
  })
})

describe('getSpec', () => {
  it('returns null for an unknown slug', async () => {
    expect(await getSpec('does-not-exist')).toBeNull()
  })

  it('returns the record for a known slug', async () => {
    const { record } = await saveSpec({ sourceUrl: 'https://example.com/a.json', title: 'Findable' })
    expect(await getSpec(record.slug)).toMatchObject({ slug: record.slug, title: 'Findable' })
  })
})

describe('listSpecs', () => {
  it('returns specs ordered by createdAt descending', async () => {
    await saveSpec({ sourceUrl: 'https://example.com/a.json', title: 'First' })
    await saveSpec({ sourceUrl: 'https://example.com/b.json', title: 'Second' })
    const all = await listSpecs()
    expect(all.map((s) => s.title)).toEqual(['Second', 'First'])
  })
})

describe('deleteSpec', () => {
  it('removes an existing spec and returns true', async () => {
    const { record } = await saveSpec({ sourceUrl: 'https://example.com/a.json', title: 'Deletable' })
    expect(await deleteSpec(record.slug)).toBe(true)
    expect(await getSpec(record.slug)).toBeNull()
  })

  it('returns false for an unknown slug', async () => {
    expect(await deleteSpec('does-not-exist')).toBe(false)
  })
})
