import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { specs } from '@/lib/db/schema'
import { slugify } from '@/lib/slug'

export interface SpecRecord {
  slug: string
  sourceUrl: string
  title: string
  description: string | null
  version: string | null
  createdAt: string
  updatedAt: string
}

type SpecRow = typeof specs.$inferSelect

function toRecord(row: SpecRow): SpecRecord {
  return {
    slug: row.slug,
    sourceUrl: row.sourceUrl,
    title: row.title,
    description: row.description,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getSpec(slug: string): Promise<SpecRecord | null> {
  const [row] = await db.select().from(specs).where(eq(specs.slug, slug)).limit(1)
  return row ? toRecord(row) : null
}

export async function listSpecs(): Promise<SpecRecord[]> {
  const rows = await db.select().from(specs).orderBy(desc(specs.createdAt))
  return rows.map(toRecord)
}

export interface SaveSpecInput {
  sourceUrl: string
  title: string
  description?: string | null
  version?: string | null
}

/**
 * Register a spec by source URL, or sync its metadata if already registered.
 * The slug (and the /docs/[slug] URL it backs) is assigned once at creation
 * and never changes, even if the spec's title changes later.
 */
export async function saveSpec(input: SaveSpecInput): Promise<SpecRecord> {
  const description = input.description ?? null
  const version = input.version ?? null

  const [existing] = await db
    .select()
    .from(specs)
    .where(eq(specs.sourceUrl, input.sourceUrl))
    .limit(1)

  if (existing) {
    const changed =
      existing.title !== input.title ||
      existing.description !== description ||
      existing.version !== version

    if (!changed) return toRecord(existing)

    const [updated] = await db
      .update(specs)
      .set({
        title: input.title,
        description,
        version,
        updatedAt: new Date(),
      })
      .where(eq(specs.slug, existing.slug))
      .returning()
    return toRecord(updated)
  }

  const base = slugify(input.title) || 'spec'
  let slug = base
  let suffix = 2
  while (await getSpec(slug)) {
    slug = `${base}-${suffix}`
    suffix += 1
  }

  const [created] = await db
    .insert(specs)
    .values({ slug, sourceUrl: input.sourceUrl, title: input.title, description, version })
    .returning()
  return toRecord(created)
}

export async function deleteSpec(slug: string): Promise<boolean> {
  const deleted = await db.delete(specs).where(eq(specs.slug, slug)).returning()
  return deleted.length > 0
}
