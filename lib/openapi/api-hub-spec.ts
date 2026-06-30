// The OpenAPI document for API Hub's own backend — dogfooding the product
// to document the routes under app/api/. Kept in sync by hand with the
// route handlers in app/api/auth, app/api/spec, app/api/specs and
// app/api/proxy.
export const apiHubSpec: Record<string, unknown> = {
  openapi: '3.0.3',
  info: {
    title: 'API Hub API',
    version: '1.0.0',
    description:
      'A API interna que move o próprio API Hub: autenticação por sessão, busca e registro de specs OpenAPI/Swagger, e o proxy usado pelo botão "Testar endpoint". Todas as rotas, exceto o login, exigem uma sessão válida (cookie httpOnly assinado com JWT).',
    contact: { name: 'API Hub' },
  },
  servers: [{ url: '/api', description: 'Mesma origem da aplicação' }],
  tags: [
    { name: 'Auth', description: 'Login e logout da sessão da instância.' },
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
          'Valida usuário e senha contra as variáveis de ambiente AUTH_USERNAME/AUTH_PASSWORD (comparação em tempo constante) e, em caso de sucesso, define o cookie de sessão httpOnly com um JWT válido por 7 dias.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
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
                  properties: { ok: { type: 'boolean', example: true } },
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
          '500': {
            description: 'AUTH_USERNAME ou AUTH_PASSWORD não configurados no servidor.',
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
        description: 'Remove o cookie de sessão.',
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
    '/spec': {
      get: {
        tags: ['Specs'],
        operationId: 'fetchSpec',
        summary: 'Buscar e validar uma spec remota',
        description:
          'Busca a URL informada no servidor (evitando CORS no navegador), detecta JSON ou YAML automaticamente e valida que o documento parece ser uma especificação OpenAPI/Swagger antes de devolvê-lo.',
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
          'Lista as specs já registradas nesta instância (slug, URL de origem e título), mais recentes primeiro.',
        responses: {
          '200': {
            description: 'Lista de specs registradas.',
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
          'Gera um slug a partir do título (com sufixo numérico em caso de colisão) e registra { slug, sourceUrl, title }, tornando a spec acessível em /docs/[slug]. Se a sourceUrl já estiver registrada, devolve o registro existente.',
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
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Spec registrada (ou já existente).',
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
    '/proxy': {
      post: {
        tags: ['Proxy'],
        operationId: 'proxyRequest',
        summary: 'Executar uma requisição (Testar endpoint)',
        description:
          'Encaminha, a partir do servidor, a requisição montada pelo "Testar endpoint" — contornando CORS no navegador — e devolve status, headers, corpo e tempo de resposta da chamada real. Apenas destinos http(s) são aceitos.',
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
  },
}
