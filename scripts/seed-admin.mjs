// Bootstrap do primeiro usuário admin a partir de AUTH_USERNAME/AUTH_PASSWORD.
// Roda uma única vez após a migration que cria a tabela users (idempotente:
// se já existir qualquer usuário, não faz nada). Depois do seed essas env
// vars deixam de ser lidas pelo login — as credenciais passam a morar só na
// tabela users, com hash bcrypt. Também faz o backfill das ai_conversations
// pré-multi-usuário (user_id nulo) atribuindo-as ao admin criado.
import postgres from 'postgres'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL não está configurado.')
}

// trim() cobre .env com fim de linha CRLF (Windows), que deixaria um \r
// grudado no fim do valor quando carregado via `source .env`.
const username = process.env.AUTH_USERNAME?.trim()
const password = process.env.AUTH_PASSWORD?.trim()
if (!username || !password) {
  throw new Error('AUTH_USERNAME/AUTH_PASSWORD não estão configurados — necessários só para este seed inicial.')
}

const sql = postgres(connectionString, { max: 1 })

const existing = await sql`SELECT count(*)::int AS n FROM users`
if (existing[0].n > 0) {
  console.log('[seed-admin] Tabela users já tem registros — nada a fazer.')
  await sql.end()
  process.exit(0)
}

const passwordHash = await bcrypt.hash(password, 10)

await sql.begin(async (tx) => {
  const [admin] = await tx`
    INSERT INTO users (username, name, password_hash, status)
    VALUES (${username}, ${username}, ${passwordHash}, 'active')
    RETURNING id
  `
  await tx`
    INSERT INTO user_groups (user_id, group_id)
    SELECT ${admin.id}, id FROM groups WHERE name = 'Administradores'
  `
  const backfilled = await tx`
    UPDATE ai_conversations SET user_id = ${admin.id} WHERE user_id IS NULL
  `
  console.log(`[seed-admin] Admin "${username}" criado no grupo Administradores.`)
  console.log(`[seed-admin] ${backfilled.count} conversa(s) de IA existente(s) atribuída(s) ao admin.`)
})

await sql.end()
