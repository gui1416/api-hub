import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

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
