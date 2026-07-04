import { eq } from 'drizzle-orm'
import { db, type DbOrTx } from '@/lib/db/client'
import { groups, groupSpecs, specs, userGroups } from '@/lib/db/schema'

/**
 * Conjunto de specs que o usuário pode ver: 'all' se qualquer grupo dele tem
 * allSpecs=true (padrão), senão a união dos slugs em group_specs dos grupos
 * restritos. Usuário sem grupo nenhum não vê spec registrada nenhuma (na
 * prática ele também não tem docs.view, então nem chega às rotas de docs).
 *
 * Deliberadamente fora do middleware — a checagem por slug fica nas
 * rotas/páginas (GET /api/specs, /docs/[slug], chat), que já resolvem
 * identidade via lib/request-identity.ts.
 */
export type AllowedSpecs = 'all' | Set<string>

export async function getAllowedSpecSlugs(
  userId: string,
  tx: DbOrTx = db,
): Promise<AllowedSpecs> {
  const rows = await tx
    .select({ allSpecs: groups.allSpecs, specSlug: groupSpecs.specSlug })
    .from(userGroups)
    .innerJoin(groups, eq(groups.id, userGroups.groupId))
    .leftJoin(groupSpecs, eq(groupSpecs.groupId, groups.id))
    .where(eq(userGroups.userId, userId))

  const allowed = new Set<string>()
  for (const row of rows) {
    if (row.allSpecs) return 'all'
    if (row.specSlug) allowed.add(row.specSlug)
  }
  return allowed
}

export function isSpecAllowed(allowed: AllowedSpecs, slug: string): boolean {
  return allowed === 'all' || allowed.has(slug)
}

export async function canAccessSpec(
  userId: string,
  slug: string,
  tx: DbOrTx = db,
): Promise<boolean> {
  return isSpecAllowed(await getAllowedSpecSlugs(userId, tx), slug)
}

/**
 * A doc padrão do hub (/docs) participa da mesma ACL como pseudo-spec, mas
 * via flag no grupo (groups.hubDocs) — ela não tem linha em `specs`. Vale a
 * união dos grupos: qualquer grupo com allSpecs=true OU hubDocs=true libera.
 */
export async function canAccessHubDocs(
  userId: string,
  tx: DbOrTx = db,
): Promise<boolean> {
  const rows = await tx
    .select({ allSpecs: groups.allSpecs, hubDocs: groups.hubDocs })
    .from(userGroups)
    .innerJoin(groups, eq(groups.id, userGroups.groupId))
    .where(eq(userGroups.userId, userId))
  return rows.some((row) => row.allSpecs || row.hubDocs)
}

/**
 * Variante por sourceUrl (o chat de IA referencia conversas por
 * specSourceUrl, não por slug). URL que não corresponde a nenhuma spec
 * registrada é permitida — a ACL só cobre o catálogo; o acesso à rota em si
 * continua atrás de chat.use no middleware, como sempre foi.
 */
export async function canAccessSpecSource(
  userId: string,
  sourceUrl: string,
  tx: DbOrTx = db,
): Promise<boolean> {
  const [record] = await tx
    .select({ slug: specs.slug })
    .from(specs)
    .where(eq(specs.sourceUrl, sourceUrl))
    .limit(1)
  if (!record) return true
  return canAccessSpec(userId, record.slug, tx)
}
