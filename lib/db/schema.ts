import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const specs = pgTable('specs', {
  slug: text('slug').primaryKey(),
  sourceUrl: text('source_url').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  version: text('version'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 'auth.login' | 'auth.logout' | 'spec.created' | 'spec.updated' | 'spec.deleted' | 'proxy.request'
    action: text('action').notNull(),
    // authenticated username, or 'anonymous' for a failed login attempt
    actor: text('actor').notNull(),
    status: text('status').notNull(), // 'success' | 'failure'
    metadata: jsonb('metadata'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('audit_logs_created_at_idx').on(table.createdAt)],
)
