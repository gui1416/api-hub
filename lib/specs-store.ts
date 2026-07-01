import { desc, eq } from 'drizzle-orm'
import { db, type DbOrTx } from '@/lib/db/client'
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

export async function getSpec(slug: string, tx: DbOrTx = db): Promise<SpecRecord | null> {
  const [row] = await tx.select().from(specs).where(eq(specs.slug, slug)).limit(1)
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

export interface SaveSpecResult {
  record: SpecRecord
  event: 'created' | 'updated' | 'unchanged'
}

/**
 * Register a spec by source URL, or sync its metadata if already registered.
 * The slug (and the /docs/[slug] URL it backs) is assigned once at creation
 * and never changes, even if the spec's title changes later.
 *
 * Accepts an optional `tx` so callers can compose this insert/update
 * atomically with other statements (e.g. an audit log entry) in the same
 * transaction.
 */
export async function saveSpec(input: SaveSpecInput, tx: DbOrTx = db): Promise<SaveSpecResult> {
  const description = input.description ?? null
  const version = input.version ?? null

  const [existing] = await tx
    .select()
    .from(specs)
    .where(eq(specs.sourceUrl, input.sourceUrl))
    .limit(1)

  if (existing) {
    const changed =
      existing.title !== input.title ||
      existing.description !== description ||
      existing.version !== version

    if (!changed) return { record: toRecord(existing), event: 'unchanged' }

    const [updated] = await tx
      .update(specs)
      .set({
        title: input.title,
        description,
        version,
        updatedAt: new Date(),
      })
      .where(eq(specs.slug, existing.slug))
      .returning()
    return { record: toRecord(updated), event: 'updated' }
  }

  const base = slugify(input.title) || 'spec'
  let slug = base
  let suffix = 2
  while (await getSpec(slug, tx)) {
    slug = `${base}-${suffix}`
    suffix += 1
  }

  const [created] = await tx
    .insert(specs)
    .values({ slug, sourceUrl: input.sourceUrl, title: input.title, description, version })
    .returning()
  return { record: toRecord(created), event: 'created' }
}

export async function deleteSpec(slug: string, tx: DbOrTx = db): Promise<boolean> {
  const deleted = await tx.delete(specs).where(eq(specs.slug, slug)).returning()
  return deleted.length > 0
}
