// Cria (se não existir) o banco de testes de integração no mesmo servidor do
// DATABASE_URL, pra rodar os testes destrutivos sem tocar no banco real.
import postgres from 'postgres'

const base = process.env.DATABASE_URL
if (!base) throw new Error('DATABASE_URL não está configurado.')

const url = new URL(base)
const admin = postgres(base, { max: 1 })
const exists = await admin`SELECT 1 FROM pg_database WHERE datname = 'apihub_test'`
if (exists.length === 0) {
  await admin.unsafe('CREATE DATABASE apihub_test')
  console.log('[test-db] banco apihub_test criado.')
} else {
  console.log('[test-db] banco apihub_test já existe.')
}
await admin.end()

url.pathname = '/apihub_test'
console.log(`TEST_DATABASE_URL=${url.toString()}`)
