import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const userStatusEnum = pgEnum('user_status', ['active', 'disabled'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  // Perfil: name/email obrigatórios na API (email nullable no banco porque
  // linhas pré-0004 não têm — o UNIQUE do Postgres permite múltiplos NULLs).
  name: text('name').notNull(),
  email: text('email').unique(),
  phone: text('phone'),
  company: text('company'),
  jobTitle: text('job_title'),
  passwordHash: text('password_hash').notNull(),
  status: userStatusEnum('status').notNull().default('active'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  // Junto com lastLoginAt deriva o "online" da tela de usuários — sem
  // tabela de sessão/presença (ver lib/auth.ts#isOnline).
  lastLogoutAt: timestamp('last_logout_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description'),
  // Grupos seedados ("Administradores", "Usuários") não podem ser removidos
  // — evita a instância ficar sem nenhum grupo com permissões admin.
  isSystem: boolean('is_system').notNull().default(false),
  // ACL por spec: true = o grupo vê todas as specs; false = só as listadas em
  // group_specs. Acesso efetivo do usuário é a união dos grupos dele.
  allSpecs: boolean('all_specs').notNull().default(true),
  // A doc padrão do hub (/docs) é uma pseudo-spec da mesma ACL: allSpecs=true
  // a inclui; com allSpecs=false este flag decide (default true preserva o
  // comportamento pré-0005 de grupos já restritos).
  hubDocs: boolean('hub_docs').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(), // ex: "admin.users", slugificado do nome na criação
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const groupPermissions = pgTable(
  'group_permissions',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.permissionId] })],
)

export const userGroups = pgTable(
  'user_groups',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.groupId] })],
)

// ACL por spec (usada só quando groups.allSpecs = false): quais specs
// registradas o grupo pode ver/usar. Cascade nos dois lados — remover o grupo
// ou a spec limpa as associações.
export const groupSpecs = pgTable(
  'group_specs',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    specSlug: text('spec_slug')
      .notNull()
      .references(() => specs.slug, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.specSlug] })],
)

// Singleton (sempre a linha id=1): regras globais que o admin define pra IA,
// injetadas no systemPrompt de toda conversa.
export const aiSettings = pgTable('ai_settings', {
  id: integer('id').primaryKey().default(1),
  systemPromptRules: text('system_prompt_rules'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

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
  // Dono da conversa. Anulável com set null: remover o usuário preserva o
  // histórico/uso pro dashboard — a conversa fica atribuída a "usuário
  // removido" na agregação, em vez de ser apagada em cascata.
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('ai_conversations_spec_idx').on(table.specSourceUrl, table.userId, table.updatedAt)])

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
