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

await migrate(db, { migrationsFolder: './drizzle' })
await sql.end()

console.log('[migrate] Migrações aplicadas com sucesso.')
