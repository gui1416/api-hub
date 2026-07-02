import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

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

export const aiProviderTypeEnum = pgEnum('ai_provider_type', ['openai-compatible'])
// enum aberto: 'anthropic'/'gemini' entram depois como valores novos + adapter novo, sem quebrar linhas existentes.

export const aiProviders = pgTable('ai_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  providerType: aiProviderTypeEnum('provider_type').notNull().default('openai-compatible'),
  baseUrl: text('base_url').notNull(), // ex: https://api.groq.com/openai/v1
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  apiKeyLast4: text('api_key_last4').notNull(), // só pra exibir mascarado, sem decriptar
  model: text('model').notNull(),
  priority: integer('priority').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  failureCount: integer('failure_count').notNull().default(0),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const aiConversations = pgTable('ai_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  specSourceUrl: text('spec_source_url').notNull(),
  title: text('title'), // preenchido depois da 1ª mensagem (truncando a pergunta do usuário)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('ai_conversations_spec_idx').on(table.specSourceUrl, table.updatedAt)])

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  mentionedSpecIds: jsonb('mentioned_spec_ids'), // string[] de slugs (specs.slug é PK imutável da tabela specs)
  providerLabel: text('provider_label'),
  providerType: text('provider_type'),
  model: text('model'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  latencyMs: integer('latency_ms'),
  usedFallback: boolean('used_fallback').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('ai_messages_conversation_idx').on(table.conversationId, table.createdAt)])
