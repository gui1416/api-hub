// Applies pending Drizzle migrations on container startup.
// Uses drizzle-orm's runtime migrator (not the drizzle-kit CLI) so the
// production image only needs the regular dependencies, not devDependencies.
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL não está configurado.')
}

const sql = postgres(connectionString, { max: 1 })
const db = drizzle(sql)

// Serializes concurrent migrate.mjs runs (e.g. two containers overlapping
// during a rolling restart) so the second one waits instead of racing the
// first to create the same tables.
const MIGRATION_LOCK_KEY = 78234910

try {
  await sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`
  await migrate(db, { migrationsFolder: './drizzle' })
} finally {
  await sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`
  await sql.end()
}

console.log('[migrate] Migrações aplicadas com sucesso.')
