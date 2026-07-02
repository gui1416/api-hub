# Plano: chat com IA sobre a documentação aberta

## Objetivo

Botão dentro do command palette (Cmd+K) que abre um dialog de chat com
IA. Por padrão o contexto é a spec atualmente aberta (resumo estruturado,
não o JSON inteiro); digitando `@` na conversa dá pra mencionar outra
spec já registrada no banco e somar ela ao contexto. Provedores de IA
(Groq e, no futuro, qualquer endpoint compatível com OpenAI) configuráveis
numa rota `/config-ia`, com fallback ordenado e circuit breaker se um
provider começar a falhar.

O schema **não fica preso ao Groq** — é modelado como uma lista genérica
de "AI providers" desde o início (ver seção 4).

## 1. Onde o botão entra

`components/api-hub/spec-switcher.tsx` já é o `CommandDialog` (Cmd+K) —
"dentro do command" = um novo grupo ali:

```
CommandGroup heading="Assistente"
  CommandItem "Conversar sobre esta API" (ícone Sparkles/MessageCircle)
```

Selecionar fecha o switcher e abre um `AiChatDialog`
(`components/api-hub/ai-chat-dialog.tsx`). Estado `aiChatOpen` fica em
`api-hub.tsx`, ao lado de `switcherOpen`.

## 2. Componentes de UI (já existem em `components/ui/`)

- `dialog.tsx` → casco do modal.
- `message.tsx` → balões (`align="end"|"start"` pra usuário/assistente).
- `message-scroller.tsx` → auto-scroll do histórico
  (`@shadcn/react/message-scroller`, já é dependência).
- `spinner.tsx` → "gerando resposta".
- `marker.tsx` → avisos inline ("trocando pra provider de fallback...",
  separador de conversas).
- `input-group.tsx` → caixa de texto + botão de enviar.
- `command.tsx` → popover de `@menção` — fuzzy match já vem de graça do
  `cmdk` por baixo, não preciso escrever nada extra pra `@rhid`, `@folha`
  funcionarem por similaridade.

## 3. Modelo de dados (nova migration)

### `ai_providers` — genérico, não preso a "Groq"

```ts
export const aiProviderTypeEnum = pgEnum('ai_provider_type', ['openai-compatible'])
// enum aberto: 'anthropic'/'gemini' entram depois como valores novos +
// adapter novo, sem quebrar as linhas existentes.

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
  // circuit breaker — estado operacional, não estatística de exibição
  failureCount: integer('failure_count').notNull().default(0),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

`providerType: 'openai-compatible'` é o único adapter implementado no v1
— cobre Groq, OpenAI, OpenRouter, Ollama, vLLM, LM Studio e Perplexity
(todos falam o formato de chat completions da OpenAI), só trocando
`baseUrl`/`model`/chave. Claude (Anthropic) e Gemini nativos ficam
documentados como possíveis valores futuros do enum, **não implementados
agora** — exigiriam SDKs e adapters próprios, e não foi isso que foi
pedido.

### `ai_conversations` — uma conversa por spec (sugestão aceita)

```ts
export const aiConversations = pgTable('ai_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  specSourceUrl: text('spec_source_url').notNull(),
  title: text('title'), // preenchido depois da 1ª mensagem (seção 8)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('ai_conversations_spec_idx').on(table.specSourceUrl, table.updatedAt)])
```

### `ai_messages`

```ts
export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  mentionedSpecIds: jsonb('mentioned_spec_ids'), // string[] de slugs — ver nota abaixo
  // observabilidade (fica junto por enquanto — ver seção "over-engineering evitado")
  providerLabel: text('provider_label'),
  providerType: text('provider_type'),
  model: text('model'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  latencyMs: integer('latency_ms'),
  usedFallback: boolean('used_fallback').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('ai_messages_conversation_idx').on(table.conversationId, table.createdAt)])
```

`specs.slug` já é a chave primária imutável da tabela `specs` (não existe
`id` separado, e o `CLAUDE.md` documenta que o slug nunca muda) — por
isso `mentionedSpecIds` guarda slugs mesmo, só nomeado assim pra deixar a
intenção clara.

Abrir o chat numa spec: pega (ou cria) a `ai_conversations` mais recente
daquele `specSourceUrl`, carrega suas mensagens. Trocar de spec ou criar
"nova conversa" explicitamente cria outra linha em `ai_conversations`.

## 4. Over-engineering que decidi NÃO fazer agora (e por quê)

- **Interface de cache plugável (`SpecCacheProvider`/`RedisCacheProvider`)**
  — é um `Map` em memória com TTL (seção 6). Trocar por Redis um dia,
  se precisar, é reescrever uma função pequena — não ganho nada tendo a
  interface pronta hoje pra uma escala que não temos.
- **Salvar `requestSchema`/`responseSchema` de cada operação durante o
  parsing "pra preparar RAG futuro"** — já dá pra puxar isso sob demanda
  do `ParsedSpec` cacheado (seção 6) quando essa necessidade aparecer de
  verdade, sem persistir nada a mais agora.
- **Tabela `ai_message_metrics` separada de `ai_messages`** — separação
  de responsabilidade é válida em tese, mas no volume esperado (app de
  login único) é um JOIN a mais em toda consulta sem ganho prático hoje.
  Reversível fácil depois se incomodar.
- **`successCount`/`averageLatency` como colunas mantidas manualmente**
  — contador desnormalizado quebra fácil (um caminho de erro que esquece
  de incrementar). As mesmas estatísticas saem de uma query agregada em
  cima de `ai_messages` na hora de renderizar `/config-ia`
  (`AVG(latency_ms)`, `COUNT(*) FILTER (...)`), sem manter estado
  duplicado.
- **Custo estimado por provider** — depende de tabela de preço por
  modelo que muda com frequência. Já guardamos os tokens; calcular custo
  em cima disso é um `estimatedCost = tokens * pricePerToken` que dá pra
  somar depois sem mudar schema agora.
- **Adapters nativos de Claude/Gemini, seletor de modelo por conversa,
  modo de busca web do Perplexity** — discutido na seção 3, escopo maior
  que o pedido original, fica documentado como caminho aberto (enum
  `providerType` não bloqueia), não implementado no v1.

## 5. Contexto: resumo estruturado, não a spec inteira

A partir do `ParsedSpec` que o app já calcula
(`lib/openapi/parser.ts#parseOpenAPI`):

```json
{
  "title": "RHiD API",
  "version": "0.0.1",
  "servers": ["https://www.rhid.com.br"],
  "endpoints": [
    { "method": "POST", "path": "/login", "summary": "Create a token", "tags": ["Login"] }
  ]
}
```

Drill-down automático de schema por operação citada na pergunta fica
como próxima iteração (não bloqueia v1).

## 6. Cache de specs (simples, sem interface)

`lib/ai/context.ts`: `Map<sourceUrl, { parsed, fetchedAt }>` em memória,
TTL curto (ex: 5 min). Processo Node de vida longa, sem problema de
cache por instância.

**Invalidação manual (sugestões #3 + #11, unificadas):** uma função só,
`invalidateSpecCache(sourceUrl)`, chamada por:
- botão "Atualizar contexto" dentro do `AiChatDialog`;
- botão "Reprocessar spec" na página `/docs/[slug]` (reaproveita a mesma
  função — não são duas implementações).

## 7. Cliente de IA + fallback + circuit breaker (`lib/ai/`)

Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`) pro adapter
`openai-compatible` — streaming/parsing de SSE prontos.

```
providers = ai_providers WHERE enabled AND (cooldown_until IS NULL OR cooldown_until < now())
            ORDER BY priority ASC

para cada provider:
  tenta streamText(...)
  sucesso: zera failure_count, grava ai_messages (com métricas)
  falha 401/403: cooldown_until = now() + 15min
  falha 429: cooldown_until = now() + Retry-After (do header) ou 5min
  qualquer falha: Marker no chat ("trocando pra <label>...") e tenta o próximo

todos falharam: erro visível no chat, não derruba a rota.
```

## 8. Novas rotas de API

- **`GET/PUT /api/config-ia`** — lista/edita `ai_providers`. `GET` só
  devolve `apiKeyLast4`. Audita `ai.config_updated`.
- **`GET /api/ai/conversations?sourceUrl=...`** — lista conversas
  daquela spec (pra um seletor "conversas anteriores", se quiser expor).
- **`POST /api/ai/conversations`** — cria conversa nova pra uma spec.
- **`GET /api/ai/conversations/:id/messages`** — últimas mensagens.
- **`POST /api/ai/conversations/:id/messages`** — manda mensagem, roda
  fallback, grava resposta, stream de volta. Depois da 1ª troca
  completa, gera o título (seção 9) se ainda não tiver.

## 9. Título automático (sem custo extra de LLM)

Trunca a primeira pergunta do usuário (ex: 40-50 caracteres, cortando em
palavra inteira) como título — sem chamada extra ao modelo só pra isso.
Se quiser um título "resumido de verdade" via IA depois, é uma
melhoria isolada, não bloqueia agora.

## 10. Indicador de contexto ativo + exportar Markdown

- **Contexto ativo:** os "chips" da seção 12 mostram a spec principal
  E as menções juntas (não só as menções) — ex:
  `[RHiD (principal)] [+ Folha] [+ Assinatura]`, sempre visíveis acima
  do input enquanto a conversa acontece.
- **Exportar Markdown:** botão no header do `AiChatDialog`, monta um
  `.md` a partir das mensagens já carregadas em memória (`# Conversa\n\n**Você:** ...\n\n**Assistente:** ...`)
  e dispara um download client-side — sem rota nova, sem dependência
  nova.

## 11. Limite de uso por tokens

`AI_RATE_LIMIT_TOKENS_PER_HOUR` / `AI_RATE_LIMIT_TOKENS_PER_DAY` (env
vars opcionais, sem limite se não setadas). Antes de chamar o provider:
`SELECT sum(prompt_tokens + completion_tokens) FROM ai_messages WHERE created_at > now() - interval '1 hour'`
contra o teto. Estourou: mensagem clara no chat, não 500.

## 12. `@menção` no chat

Textarea controlado; `@` seguido de texto abre popover `Command`
listando specs de `GET /api/specs` (fuzzy de graça). Selecionar remove o
`@texto` digitado e vira um chip removível — chips (spec principal +
menções) formam `mentionedSpecIds` no payload, desacoplado do texto da
mensagem.

## 13. Criptografia das chaves

AES-256-GCM via `node:crypto` (sem dependência nova), chave em
`AI_CONFIG_ENCRYPTION_KEY` (32 bytes base64, gerada uma vez tipo
`openssl rand -base64 32`, documentada no `.env.example`/README — mesmo
padrão do `JWT_SECRET` hoje). `apiKeyLast4` guardado separado pra exibir
mascarado sem precisar decriptar.

## 14. Nova página `/config-ia`

`app/config-ia/page.tsx`, mesmo padrão de `app/docs/page.tsx`. Lista
providers (label, tipo, modelo, prioridade, habilitado, `apiKeyLast4`,
estatísticas calculadas via query — sucesso %, latência média — e estado
do circuit breaker se em cooldown), formulário de
adicionar/editar/remover/reordenar. Entra no `middleware.ts`:

```ts
matcher: [
  '/', '/docs/:path*', '/config-ia',
  '/api/spec/:path*', '/api/specs/:path*', '/api/proxy/:path*',
  '/api/config-ia/:path*', '/api/ai/:path*',
]
```

## 15. Segurança / auditoria

- `config-ia` e `/api/ai/*` atrás do gate de sessão existente.
- Chave criptografada em repouso, nunca logada, nunca decriptada de
  volta pro client.
- `/api/ai/*` roda no servidor — chave nunca chega no browser.
- Audita `ai.config_updated`. Mensagens de chat não viram `audit_logs`
  (a tabela `ai_messages` já cobre com mais contexto útil).

## 16. Testes

- `lib/ai/crypto.test.ts`: round-trip encrypt/decrypt.
- `lib/ai/groq-client.test.ts` (nome genérico:
  `lib/ai/provider-client.test.ts`): fallback pula em 429/401, respeita
  `cooldown_until`, propaga erro se todos falharem.
- `lib/ai/context.test.ts`: resumo estruturado, cache com TTL,
  invalidação manual.
- `app/api/config-ia/route.test.ts`: `PUT` substitui a lista, `GET`
  nunca devolve chave real.
- Manual: chat sobre a spec aberta, `@menção`, forçar erro na chave
  primária (fallback + cooldown), estourar limite de tokens, exportar
  Markdown, título automático aparecendo.

## Fora de escopo (documentado, não faço sem pedido explícito)

- Adapters nativos Anthropic/Gemini, seletor de modelo por conversa,
  modo de busca web do Perplexity (seção 4).
- Drill-down automático de schema por operação (seção 5).
- Custo estimado por provider (seção 4).
- Limite de uso por usuário individual (não existe conceito de usuário
  além do login único compartilhado).

## Perguntas antes de eu implementar

1. `PUT /api/config-ia` substituindo a lista inteira de providers está
   bom, ou prefere CRUD individual por provider? Manter PUT /api/config-ia substituindo a lista inteira.
2. Os tempos de cooldown do circuit breaker (15min pra 401/403, 5min ou
   `Retry-After` pra 429) fazem sentido como ponto de partida? Sim.
3. Os limites de tokens (`AI_RATE_LIMIT_TOKENS_PER_HOUR`/`_PER_DAY`)
   ficam sem valor padrão (desabilitado até configurar) ou já entra com
   algum default conservador? Definir valores padrão conservadores de AI_RATE_LIMIT_TOKENS_PER_HOUR=500000 e AI_RATE_LIMIT_TOKENS_PER_DAY=5000000 mas mantenha disponivel a configuração para auterar esses valores depois.
