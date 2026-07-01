// Deletes audit_logs rows older than the 1-year retention window. Meant to
// be invoked on a schedule against the already-running container (e.g. a
// Coolify Scheduled Task), not as part of the app's own request lifecycle —
// see the README for how it's wired up in production.
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL não está configurado.')
}

const sql = postgres(connectionString, { max: 1 })

const deleted = await sql`
  DELETE FROM audit_logs
  WHERE created_at < now() - interval '1 year'
`

await sql.end()

console.log(`[audit-cleanup] ${deleted.count} linha(s) de auditoria com mais de 1 ano removida(s).`)
