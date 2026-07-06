// The OpenAPI document for API Hub's own backend — dogfooding the product
// to document the routes under app/api/. Kept in sync by hand with the
// route handlers in app/api/**.
export const apiHubSpec: Record<string, unknown> = {
  openapi: '3.0.3',
  info: {
    title: 'API Hub API',
    version: '1.1.0',
    description:
      'A API interna que move o próprio API Hub: autenticação por sessão, gestão de usuários/grupos/permissões (RBAC), registro de specs OpenAPI/Swagger, o proxy usado pelo botão "Testar endpoint", configuração e uso do chat de IA, e o dashboard de consumo de tokens. Todas as rotas, exceto o login, exigem uma sessão válida (cookie httpOnly assinado com JWT); as rotas administrativas exigem ainda a permissão correspondente (ver middleware.ts).',
    contact: { name: 'API Hub' },
  },
  servers: [{ url: '/api', description: 'Mesma origem da aplicação' }],
  tags: [
    { name: 'Auth', description: 'Login, logout, troca de senha e a sessão atual.' },
    {
      name: 'Specs',
      description:
        'Busca de specs remotas e registro de specs por slug compartilhável.',
    },
    {
      name: 'Proxy',
      description:
        'Executa, no servidor, as requisições disparadas pelo "Testar endpoint".',
    },
    {
      name: 'Admin — Usuários',
      description: 'Gestão de contas do diretório (requer a permissão admin.users).',
    },
    {
      name: 'Admin — Grupos',
      description:
        'Grupos, seus membros, permissões e ACL de specs (requer admin.groups).',
    },
    {
      name: 'Admin — Permissões',
      description: 'Catálogo de permissões atribuíveis aos grupos (requer admin.groups).',
    },
    {
      name: 'Admin — Dashboard',
      description: 'Consumo de tokens de IA agregado (requer admin.dashboard).',
    },
    {
      name: 'Config IA',
      description:
        'Providers de IA e regras globais do assistente (requer admin.ai).',
    },
    {
      name: 'Chat IA',
      description: 'Conversas do assistente de IA sobre uma spec (requer chat.use).',
    },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'apihub_session',
        description:
          'Cookie httpOnly contendo um JWT assinado, emitido por POST /auth/login.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Não autenticado.' },
        },
      },
      SpecRecord: {
        type: 'object',
        properties: {
          slug: { type: 'string', example: 'acme-payments-api' },
          sourceUrl: {
            type: 'string',
            format: 'uri',
            example: 'https://api.acme.dev/openapi.yaml',
          },
          title: { type: 'string', example: 'Acme Payments API' },
          description: { type: 'string', nullable: true },
          version: { type: 'string', nullable: true, example: '1.0.0' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'maria.silva' },
          name: { type: 'string', example: 'Maria Silva' },
          email: { type: 'string', format: 'email', nullable: true },
          phone: { type: 'string', nullable: true },
          company: { type: 'string', nullable: true },
          jobTitle: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['active', 'disabled'] },
          mustChangePassword: { type: 'boolean' },
          online: { type: 'boolean', description: 'Derivado de lastLoginAt/lastLogoutAt, sem tabela de sessão.' },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
          lastLogoutAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          groups: { type: 'array', items: { type: 'string' }, description: 'Nomes dos grupos do usuário.' },
        },
      },
      Group: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Administradores' },
          description: { type: 'string', nullable: true },
          isSystem: {
            type: 'boolean',
            description: 'Grupos de sistema (Administradores/Usuários) não podem ser removidos.',
          },
          memberCount: { type: 'integer' },
          permissions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Chaves das permissões concedidas ao grupo.',
          },
        },
      },
      Permission: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          key: { type: 'string', example: 'admin.users' },
          name: { type: 'string', example: 'Gestão de usuários' },
          description: { type: 'string', nullable: true },
        },
      },
      AiProvider: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          label: { type: 'string', example: 'Groq (Llama 3.3)' },
          providerType: { type: 'string', enum: ['openai-compatible'] },
          baseUrl: { type: 'string', format: 'uri', example: 'https://api.groq.com/openai/v1' },
          apiKeyLast4: { type: 'string', description: 'Últimos 4 caracteres da key, só para exibição mascarada.' },
          model: { type: 'string', example: 'llama-3.3-70b-versatile' },
          priority: { type: 'integer', description: 'Ordem de tentativa; menor primeiro.' },
          enabled: { type: 'boolean' },
          failureCount: { type: 'integer' },
          lastFailureAt: { type: 'string', format: 'date-time', nullable: true },
          cooldownUntil: { type: 'string', format: 'date-time', nullable: true },
          inCooldown: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UsageRow: {
        type: 'object',
        properties: {
          label: { type: 'string', example: 'Groq (Llama 3.3)' },
          promptTokens: { type: 'integer' },
          completionTokens: { type: 'integer' },
          totalTokens: { type: 'integer' },
          messages: { type: 'integer' },
          avgLatencyMs: { type: 'integer' },
        },
      },
      AiConversation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          specSourceUrl: { type: 'string', format: 'uri' },
          userId: { type: 'string', format: 'uuid', nullable: true },
          title: { type: 'string', nullable: true, description: 'Preenchido depois da 1ª resposta.' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      AiMessage: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          conversationId: { type: 'string', format: 'uuid' },
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string' },
          mentionedSpecIds: { type: 'array', items: { type: 'string' }, nullable: true },
          providerLabel: { type: 'string', nullable: true },
          model: { type: 'string', nullable: true },
          promptTokens: { type: 'integer', nullable: true },
          completionTokens: { type: 'integer', nullable: true },
          latencyMs: { type: 'integer', nullable: true },
          usedFallback: { type: 'boolean', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ sessionCookie: [] }],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        operationId: 'login',
        summary: 'Autenticar',
        description:
          'Valida usuário e senha (bcrypt, comparação com hash de descarte quando o username não existe pra evitar enumeração por timing) e, em caso de sucesso com conta ativa, define o cookie de sessão httpOnly com um JWT válido por 1 dia. A tentativa é sempre auditada, mesmo sem credenciais completas (actor "anonymous").',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'maria.silva' },
                  password: { type: 'string', format: 'password' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login bem-sucedido; cookie de sessão definido.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    mustChangePassword: { type: 'boolean' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Usuário ou senha inválidos.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
          '403': {
            description: 'Conta desativada.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        operationId: 'logout',
        summary: 'Encerrar sessão',
        description: 'Remove o cookie de sessão e marca lastLogoutAt (usado pro indicador "online").',
        responses: {
          '200': {
            description: 'Logout bem-sucedido.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean', example: true } },
                },
              },
            },
          },
        },
      },
    },
    '/auth/change-password': {
      post: {
        tags: ['Auth'],
        operationId: 'changePassword',
        summary: 'Trocar a própria senha',
        description:
          'Verifica a senha atual, aplica a nova (mínimo de caracteres em MIN_PASSWORD_LENGTH), limpa mustChangePassword e reemite o cookie de sessão imediatamente — sem esperar o JWT antigo expirar. Usada tanto na troca voluntária quanto no fluxo obrigatório após um reset de senha por um admin.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string', format: 'password' },
                  newPassword: { type: 'string', format: 'password' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Senha alterada; cookie de sessão reemitido sem a flag mustChangePassword.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { ok: { type: 'boolean', example: true } } },
              },
            },
          },
          '400': {
            description: 'Campos ausentes, nova senha curta demais ou senha atual incorreta.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Não autenticado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/me': {
      get: {
        tags: ['Auth'],
        operationId: 'getMe',
        summary: 'Sessão atual',
        description:
          'Identidade, grupos e permissões efetivas do usuário logado — conveniência de UX (ex: o command palette decide o que mostrar) e heartbeat do session watcher. A garantia de acesso real é sempre o middleware/rota, nunca o que este endpoint expõe.',
        responses: {
          '200': {
            description: 'Sessão válida.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    username: { type: 'string' },
                    name: { type: 'string' },
                    mustChangePassword: { type: 'boolean' },
                    groups: { type: 'array', items: { type: 'string' } },
                    permissions: { type: 'array', items: { type: 'string' } },
                    hubDocs: {
                      type: 'boolean',
                      description: 'Se algum grupo do usuário dá acesso à doc padrão do hub (/docs).',
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Sessão ausente/inválida ou conta desativada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/spec': {
      get: {
        tags: ['Specs'],
        operationId: 'fetchSpec',
        summary: 'Buscar e validar uma spec remota',
        description:
          'Busca a URL informada no servidor (evitando CORS no navegador), detecta JSON ou YAML automaticamente e valida que o documento parece ser uma especificação OpenAPI/Swagger antes de devolvê-lo. Requer a permissão specs.load.',
        parameters: [
          {
            name: 'url',
            in: 'query',
            required: true,
            description: 'URL pública (http/https) do documento OpenAPI/Swagger.',
            schema: {
              type: 'string',
              format: 'uri',
              example: 'https://api.acme.dev/openapi.yaml',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Spec encontrada e validada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    spec: {
                      type: 'object',
                      description: 'Documento OpenAPI/Swagger bruto, já parseado.',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Parâmetro "url" ausente ou inválido.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
          '422': {
            description: 'A resposta não parece ser uma spec OpenAPI/Swagger.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
          '502': {
            description: 'Falha ao buscar a URL informada.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
        },
      },
    },
    '/specs': {
      get: {
        tags: ['Specs'],
        operationId: 'listSpecs',
        summary: 'Listar specs registradas',
        description:
          'Lista as specs já registradas nesta instância, filtradas pela ACL por spec dos grupos do usuário (allSpecs ou lista explícita), mais recentes primeiro.',
        responses: {
          '200': {
            description: 'Lista de specs registradas e permitidas pra este usuário.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    specs: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SpecRecord' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Specs'],
        operationId: 'registerSpec',
        summary: 'Registrar uma spec sob um slug',
        description:
          'Gera um slug a partir do título (com sufixo numérico em caso de colisão) e registra { slug, sourceUrl, title, description, version }, tornando a spec acessível em /docs/[slug]. Se a sourceUrl já estiver registrada, sincroniza a metadata em vez de duplicar. Requer a permissão specs.load.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sourceUrl', 'title'],
                properties: {
                  sourceUrl: {
                    type: 'string',
                    format: 'uri',
                    example: 'https://api.acme.dev/openapi.yaml',
                  },
                  title: { type: 'string', example: 'Acme Payments API' },
                  description: { type: 'string', nullable: true },
                  version: { type: 'string', nullable: true, example: '1.0.0' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Spec registrada (ou sincronizada, se já existente).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    slug: { type: 'string', example: 'acme-payments-api' },
                    spec: { $ref: '#/components/schemas/SpecRecord' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Os campos "sourceUrl" e "title" são obrigatórios.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
        },
      },
    },
    '/specs/{slug}': {
      delete: {
        tags: ['Specs'],
        operationId: 'deleteSpec',
        summary: 'Remover uma spec registrada',
        description:
          'Remove o registro (não afeta a URL de origem — pode ser recarregada depois). Requer a permissão specs.delete.',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'acme-payments-api',
          },
        ],
        responses: {
          '204': { description: 'Spec removida.' },
          '404': {
            description: 'Spec não encontrada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/proxy': {
      post: {
        tags: ['Proxy'],
        operationId: 'proxyRequest',
        summary: 'Executar uma requisição (Testar endpoint)',
        description:
          'Encaminha, a partir do servidor, a requisição montada pelo "Testar endpoint" — contornando CORS no navegador — e devolve status, headers, corpo e tempo de resposta da chamada real. Apenas destinos http(s) são aceitos. Requer a permissão proxy.use. Fica registrado em audit_logs (método, URL, status, duração — nunca headers/corpo).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['method', 'url'],
                properties: {
                  method: { type: 'string', example: 'GET' },
                  url: {
                    type: 'string',
                    format: 'uri',
                    example: 'https://api.acme.dev/v2/customers',
                  },
                  headers: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                    example: { Authorization: 'Bearer sk_test_...' },
                  },
                  body: {
                    type: 'string',
                    description: 'Corpo bruto da requisição (ignorado em GET/HEAD).',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'A requisição foi executada (mesmo que o destino tenha respondido com erro).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'integer', example: 200 },
                    statusText: { type: 'string', example: 'OK' },
                    headers: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                    },
                    body: { type: 'string' },
                    durationMs: { type: 'integer', example: 184 },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Payload inválido: "method"/"url" ausentes ou URL malformada.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
          '502': {
            description: 'A requisição ao destino falhou (rede, DNS, TLS, etc.).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    durationMs: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin — Usuários'],
        operationId: 'listUsers',
        summary: 'Listar usuários',
        description: 'Lista todas as contas do diretório, com grupos e status online.',
        responses: {
          '200': {
            description: 'Lista de usuários.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { users: { type: 'array', items: { $ref: '#/components/schemas/User' } } },
                },
              },
            },
          },
          '401': {
            description: 'Não autenticado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      post: {
        tags: ['Admin — Usuários'],
        operationId: 'createUser',
        summary: 'Criar usuário',
        description:
          'Cria a conta com uma senha temporária gerada no servidor (retornada uma única vez nesta resposta) e mustChangePassword=true. Sem groupIds, entra no grupo "Usuários".',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'name', 'email'],
                properties: {
                  username: { type: 'string', example: 'maria.silva' },
                  name: { type: 'string', example: 'Maria Silva' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string', nullable: true },
                  company: { type: 'string', nullable: true },
                  jobTitle: { type: 'string', nullable: true },
                  groupIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Usuário criado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    username: { type: 'string' },
                    temporaryPassword: {
                      type: 'string',
                      description: 'Exibida uma única vez — não é persistida em texto plano.',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Username/email inválido ou grupo inexistente na seleção.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'Username ou email já cadastrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/users/{id}': {
      patch: {
        tags: ['Admin — Usuários'],
        operationId: 'updateUser',
        summary: 'Atualizar perfil, status e/ou grupos de um usuário',
        description:
          'Só os campos presentes no payload são alterados; cada seção (perfil, status, grupos) audita separadamente. Bloqueado por salvaguardas anti-lockout: não é possível desativar a si mesmo, desativar/remover o último administrador ativo, nem tirar o último admin do grupo Administradores.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['active', 'disabled'] },
                  groupIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string', nullable: true },
                  company: { type: 'string', nullable: true },
                  jobTitle: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Atualizado.',
            content: {
              'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } },
            },
          },
          '400': {
            description: 'Nada para atualizar, campo obrigatório vazio ou email inválido.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Usuário não encontrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description:
              'Violaria uma salvaguarda anti-lockout (auto-desativação, último admin ativo, etc.) ou email duplicado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      delete: {
        tags: ['Admin — Usuários'],
        operationId: 'deleteUser',
        summary: 'Remover usuário',
        description:
          'Remove a conta permanentemente (não é o mesmo que desativar). Conversas de IA sobrevivem como "Usuário removido" no dashboard (ai_conversations.userId vira NULL). Bloqueado para auto-remoção e para o último administrador ativo.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Usuário removido.' },
          '404': {
            description: 'Usuário não encontrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'Auto-remoção ou remoção do último administrador ativo.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/users/{id}/reset-password': {
      post: {
        tags: ['Admin — Usuários'],
        operationId: 'resetUserPassword',
        summary: 'Resetar a senha de um usuário',
        description:
          'Gera uma nova senha temporária (invalidando a atual imediatamente) e marca mustChangePassword=true. A senha só aparece nesta resposta, uma única vez.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: 'Senha resetada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { temporaryPassword: { type: 'string' } },
                },
              },
            },
          },
          '404': {
            description: 'Usuário não encontrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/groups': {
      get: {
        tags: ['Admin — Grupos'],
        operationId: 'listGroups',
        summary: 'Listar grupos',
        description: 'Lista todos os grupos com contagem de membros e as chaves de permissão concedidas.',
        responses: {
          '200': {
            description: 'Lista de grupos.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { groups: { type: 'array', items: { $ref: '#/components/schemas/Group' } } },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Admin — Grupos'],
        operationId: 'createGroup',
        summary: 'Criar grupo',
        description: 'Cria um grupo vazio (sem membros/permissões/specs) — configure isso depois via Propriedades.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Financeiro' },
                  description: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Grupo criado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string', nullable: true },
                    isSystem: { type: 'boolean' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'O campo "name" é obrigatório.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'Já existe um grupo com esse nome.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/groups/{id}': {
      patch: {
        tags: ['Admin — Grupos'],
        operationId: 'updateGroup',
        summary: 'Renomear/redescrever um grupo',
        description: 'Nome e descrição podem ser editados mesmo em grupos de sistema.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string' }, description: { type: 'string', nullable: true } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Atualizado.',
            content: {
              'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } },
            },
          },
          '400': {
            description: 'O nome não pode ficar vazio.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Grupo não encontrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      delete: {
        tags: ['Admin — Grupos'],
        operationId: 'deleteGroup',
        summary: 'Remover grupo',
        description:
          'Membros perdem as permissões concedidas por este grupo (as contas não são afetadas). Grupos de sistema (isSystem=true) não podem ser removidos.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Grupo removido.' },
          '404': {
            description: 'Grupo não encontrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'Grupo de sistema — não pode ser removido.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/groups/{id}/members': {
      put: {
        tags: ['Admin — Grupos'],
        operationId: 'replaceGroupMembers',
        summary: 'Substituir os membros do grupo',
        description:
          'Substitui o conjunto inteiro de membros (não é incremental). Se o grupo for "Administradores", precisa manter ao menos um membro ativo.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userIds'],
                properties: { userIds: { type: 'array', items: { type: 'string', format: 'uuid' } } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Membros atualizados.',
            content: {
              'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } },
            },
          },
          '400': {
            description: 'Usuário inexistente na seleção.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Grupo não encontrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'O grupo Administradores ficaria sem nenhum membro ativo.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/groups/{id}/permissions': {
      put: {
        tags: ['Admin — Grupos'],
        operationId: 'replaceGroupPermissions',
        summary: 'Substituir as permissões do grupo',
        description: 'Substitui o conjunto inteiro de permissões concedidas ao grupo.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['permissionIds'],
                properties: { permissionIds: { type: 'array', items: { type: 'string', format: 'uuid' } } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Permissões atualizadas.',
            content: {
              'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } },
            },
          },
          '400': {
            description: 'Permissão inexistente na seleção.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Grupo não encontrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/groups/{id}/specs': {
      put: {
        tags: ['Admin — Grupos'],
        operationId: 'replaceGroupSpecs',
        summary: 'Substituir a ACL de specs do grupo',
        description:
          'allSpecs=true dá acesso a todas as specs (e à doc padrão do hub) e ignora specSlugs; allSpecs=false restringe aos slugs informados, com hubDocs controlando a pseudo-spec da doc padrão separadamente.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['allSpecs'],
                properties: {
                  allSpecs: { type: 'boolean' },
                  hubDocs: { type: 'boolean', description: 'Só relevante quando allSpecs=false.' },
                  specSlugs: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'ACL atualizada.',
            content: {
              'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } },
            },
          },
          '400': {
            description: '"allSpecs" ausente, "specSlugs" ausente com allSpecs=false, ou spec inexistente.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Grupo não encontrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/permissions': {
      get: {
        tags: ['Admin — Permissões'],
        operationId: 'listPermissions',
        summary: 'Listar o catálogo de permissões',
        responses: {
          '200': {
            description: 'Lista de permissões.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    permissions: { type: 'array', items: { $ref: '#/components/schemas/Permission' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Admin — Permissões'],
        operationId: 'createPermission',
        summary: 'Criar uma permissão personalizada',
        description: 'A chave é gerada a partir do nome (slugify), ex: "Relatórios financeiros" → relatorios-financeiros.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Relatórios financeiros' },
                  description: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Permissão criada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Permission' } } },
          },
          '400': {
            description: 'Nome ausente ou inválido para gerar uma chave.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'Já existe uma permissão com essa chave.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/permissions/{id}': {
      delete: {
        tags: ['Admin — Permissões'],
        operationId: 'deletePermission',
        summary: 'Remover uma permissão',
        description:
          'Revoga a permissão de todos os grupos que a concediam (ON DELETE CASCADE). As 9 chaves seedadas que o middleware referencia diretamente (admin.*, specs.*, docs.view, chat.use, proxy.use) são protegidas e não podem ser removidas.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Permissão removida.' },
          '404': {
            description: 'Permissão não encontrada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'Permissão de sistema — não pode ser removida.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/dashboard/usage': {
      get: {
        tags: ['Admin — Dashboard'],
        operationId: 'getDashboardUsage',
        summary: 'Consumo de tokens de IA agregado',
        description:
          'Totais de tokens/mensagens/latência por provider, modelo e usuário (só mensagens do assistente carregam essas métricas). Usuários removidos aparecem como "Usuário removido".',
        parameters: [
          {
            name: 'range',
            in: 'query',
            schema: { type: 'string', enum: ['24h', '7d', '30d'], default: '7d' },
          },
        ],
        responses: {
          '200': {
            description: 'Uso agregado no período.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    range: { type: 'string' },
                    byProvider: { type: 'array', items: { $ref: '#/components/schemas/UsageRow' } },
                    byModel: { type: 'array', items: { $ref: '#/components/schemas/UsageRow' } },
                    byUser: { type: 'array', items: { $ref: '#/components/schemas/UsageRow' } },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Range inválido.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/config-ia': {
      get: {
        tags: ['Config IA'],
        operationId: 'listAiProviders',
        summary: 'Listar providers de IA',
        responses: {
          '200': {
            description: 'Lista de providers, em ordem de prioridade.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    providers: { type: 'array', items: { $ref: '#/components/schemas/AiProvider' } },
                  },
                },
              },
            },
          },
        },
      },
      put: {
        tags: ['Config IA'],
        operationId: 'replaceAiProviders',
        summary: 'Substituir a lista de providers',
        description:
          'Bulk-replace: providers sem "id" (ou cujo id não existe mais) são criados; os demais são atualizados; os que ficarem de fora da lista são removidos. "apiKey" é obrigatório para criar um provider novo e opcional para atualizar um existente (omitido, mantém a key atual). A key nunca é retornada nem logada — cada mutação individual (criado/atualizado/removido) é auditada separadamente.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['providers'],
                properties: {
                  providers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['label', 'providerType', 'baseUrl', 'model', 'priority', 'enabled'],
                      properties: {
                        id: { type: 'string', format: 'uuid', description: 'Omitido/desconhecido = criação.' },
                        label: { type: 'string' },
                        providerType: { type: 'string', enum: ['openai-compatible'] },
                        baseUrl: { type: 'string', format: 'uri' },
                        apiKey: { type: 'string', description: 'Obrigatório ao criar; opcional ao atualizar (rotaciona a key).' },
                        model: { type: 'string' },
                        priority: { type: 'integer' },
                        enabled: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Lista salva.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    providers: { type: 'array', items: { $ref: '#/components/schemas/AiProvider' } },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Campo obrigatório ausente/inválido em algum provider, ou apiKey ausente numa criação.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/config-ia/settings': {
      get: {
        tags: ['Config IA'],
        operationId: 'getAiSettings',
        summary: 'Ler as regras globais do assistente',
        responses: {
          '200': {
            description: 'Regras atuais (ou null se nunca configuradas).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { systemPromptRules: { type: 'string', nullable: true } },
                },
              },
            },
          },
        },
      },
      put: {
        tags: ['Config IA'],
        operationId: 'updateAiSettings',
        summary: 'Atualizar as regras globais do assistente',
        description:
          'Instruções globais somadas ao prompt base em toda conversa (junto do contexto derivado do usuário — nome/grupos/permissões, nunca texto livre do usuário).',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { systemPromptRules: { type: 'string', nullable: true } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Regras salvas.',
            content: {
              'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } },
            },
          },
          '400': {
            description: '"systemPromptRules" precisa ser texto ou null.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/config-ia/providers/{id}/usage': {
      get: {
        tags: ['Config IA'],
        operationId: 'getProviderUsage',
        summary: 'Relatório de uso de um provider',
        description:
          'Totais, tokens por dia (dia civil no fuso do app, ver lib/timezone.ts), por modelo e por usuário. O vínculo histórico é pelo texto do label — renomear o provider desassocia o histórico anterior.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'range', in: 'query', schema: { type: 'string', enum: ['24h', '7d', '30d'], default: '7d' } },
        ],
        responses: {
          '200': {
            description: 'Relatório de uso do provider.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    range: { type: 'string' },
                    provider: { $ref: '#/components/schemas/AiProvider' },
                    totals: {
                      allOf: [
                        { $ref: '#/components/schemas/UsageRow' },
                        {
                          type: 'object',
                          properties: { fallbackMessages: { type: 'integer' } },
                        },
                      ],
                    },
                    byDay: { type: 'array', items: { $ref: '#/components/schemas/UsageRow' } },
                    byModel: { type: 'array', items: { $ref: '#/components/schemas/UsageRow' } },
                    byUser: { type: 'array', items: { $ref: '#/components/schemas/UsageRow' } },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Range inválido.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Provider não encontrado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/ai/conversations': {
      get: {
        tags: ['Chat IA'],
        operationId: 'listConversations',
        summary: 'Listar as conversas do usuário sobre uma spec',
        description: 'Histórico isolado por usuário — só lista as próprias conversas.',
        parameters: [
          { name: 'sourceUrl', in: 'query', required: true, schema: { type: 'string', format: 'uri' } },
        ],
        responses: {
          '200': {
            description: 'Conversas do usuário sobre a spec.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    conversations: { type: 'array', items: { $ref: '#/components/schemas/AiConversation' } },
                  },
                },
              },
            },
          },
          '400': {
            description: '"sourceUrl" ausente.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Spec não encontrada ou fora da ACL do usuário (não distingue as duas coisas).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      post: {
        tags: ['Chat IA'],
        operationId: 'createConversation',
        summary: 'Criar uma conversa sobre uma spec',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sourceUrl'],
                properties: { sourceUrl: { type: 'string', format: 'uri' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Conversa criada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { conversation: { $ref: '#/components/schemas/AiConversation' } },
                },
              },
            },
          },
          '400': {
            description: '"sourceUrl" ausente.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Spec não encontrada ou fora da ACL do usuário.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/ai/conversations/{id}/messages': {
      get: {
        tags: ['Chat IA'],
        operationId: 'listMessages',
        summary: 'Listar as mensagens de uma conversa',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: 'Mensagens em ordem cronológica.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { messages: { type: 'array', items: { $ref: '#/components/schemas/AiMessage' } } },
                },
              },
            },
          },
          '404': {
            description: 'Conversa não encontrada ou pertence a outro usuário.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      post: {
        tags: ['Chat IA'],
        operationId: 'sendMessage',
        summary: 'Enviar uma mensagem (resposta em streaming)',
        description:
          'Persiste a mensagem do usuário, monta o contexto (spec + @menções permitidas pela ACL + regras do admin + perfil do usuário) e transmite a resposta do provider como NDJSON — uma linha JSON por evento (marker/delta/done/error). O provider é escolhido por prioridade com fallback e circuit breaker (401/403 → cooldown de 15min; 429 → Retry-After ou 5min). Sujeito a rate limit de tokens por hora/dia.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: { type: 'string' },
                  mentionedSpecIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Slugs de outras specs @mencionadas (filtrados pela ACL do usuário).',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description:
              'Stream NDJSON (Content-Type: application/x-ndjson) de eventos { type: "marker"|"delta"|"done"|"error", ... }.',
            content: { 'application/x-ndjson': { schema: { type: 'string' } } },
          },
          '400': {
            description: '"content" ausente/vazio.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Conversa não encontrada, de outro usuário, ou a spec ficou fora da ACL.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/ai/context/invalidate': {
      post: {
        tags: ['Chat IA'],
        operationId: 'invalidateAiContext',
        summary: 'Invalidar o cache de contexto de uma spec',
        description:
          'Força o próximo turno de chat a rebuscar/reparsear a spec em vez de usar o resumo em cache (TTL de 5min) — usado depois de recarregar uma spec que mudou.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sourceUrl'],
                properties: { sourceUrl: { type: 'string', format: 'uri' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Cache invalidado.',
            content: {
              'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } },
            },
          },
          '400': {
            description: '"sourceUrl" ausente.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
}
