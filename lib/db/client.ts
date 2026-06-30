import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var __apihubDb: ReturnType<typeof createDb> | undefined
}

function createDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL não está configurado.')
  }
  const queryClient = postgres(connectionString)
  return drizzle(queryClient, { schema })
}

// Reuse the connection across hot reloads in dev instead of opening a new
// pool on every module reload.
export const db = global.__apihubDb ?? createDb()
if (process.env.NODE_ENV !== 'production') global.__apihubDb = db
