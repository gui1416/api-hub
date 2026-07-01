import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

declare global {
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
function getDb() {
  if (!global.__apihubDb) {
    global.__apihubDb = createDb()
  }
  return global.__apihubDb
}

// Lazy: the real connection (and its DATABASE_URL check) is only created on
// first use, not on import — Next's build-time page-data collection imports
// every route module, and that must succeed without DATABASE_URL set.
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})

// A db-like handle that's either the top-level client or an in-flight
// transaction — lets store/audit helpers compose atomically via db.transaction.
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]
