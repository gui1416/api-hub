# Plano: suporte completo a specs Swagger 2.0

## Teste de referência

`https://www.rhid.com.br/v2/swagger.svc/swagger.json` — baixei e inspecionei:
`swagger: "2.0"`, sem `openapi`, sem `servers` (usa `host`/`basePath`), 25
paths, parâmetros de corpo como `{ name, in: "body", schema: { $ref:
"#/definitions/..." } }`, schemas em `definitions` (não
`components.schemas`), respostas com `schema` direto no objeto de resposta
(não em `content["application/json"].schema`), `securityDefinitions: {}`
(vazio — essa API específica manda o token como um parâmetro de header
comum chamado `Authorization`, não via mecanismo de security scheme).

## O que já funciona hoje

- `lib/openapi/fetch-spec.ts#fetchSpec` já aceita o documento (só exige
  `openapi` OU `swagger` no topo — linha 75).
- `lib/openapi/spec-info.ts#extractSpecInfo` já é agnóstico de formato (só
  lê `info.title`/`info.version`).
- `lib/openapi/parser.ts#parseOpenAPI` já tem um fallback de servidor pra
  Swagger 2.0 (`host`/`schemes`/`basePath` → `servers[0].url`, linhas
  205-213).
- `resolveRef`/`resolveSchema` são agnósticos do caminho do `$ref` (andam
  pelos segmentos genericamente), então `#/definitions/Foo` já resolve
  igual a `#/components/schemas/Foo` sem mudança nenhuma.

## Gaps confirmados (testei rodando o parser contra o JSON real)

1. **Corpo da requisição (`in: "body"`) não vira `requestBody`.**
   `lib/openapi/parser.ts#parseOpenAPI` só popula `requestBody` a partir de
   `op.requestBody` (construção do OpenAPI 3.x, inexistente em Swagger 2.0).
   O parâmetro `in: "body"` do Swagger 2.0 entra em `parameters` como um
   `ParsedParameter` comum — mas `ParsedParameter['in']`
   (`lib/openapi/types.ts:60`) só aceita
   `'query' | 'header' | 'path' | 'cookie'`, então isso já nasce com um cast
   inválido (`param.in as ParsedParameter['in']`, `parser.ts:141`).
   Consequência real, confirmada lendo os consumidores:
   `components/api-hub/try-it.tsx:73-75` filtra parâmetros só por
   `path`/`query`/`header` — um `in: "body"` não cai em nenhum filtro e
   simplesmente desaparece da UI. Como `operation.requestBody` nunca é
   populado pra Swagger 2.0, o campo "Body" do Try It
   (`try-it.tsx:274-275`) nunca aparece — **hoje não dá pra testar nenhum
   POST/PUT com corpo de uma spec Swagger 2.0**.

2. **Schema de resposta não aparece.**
   `parseResponses`/`pickContent` (`parser.ts:105-125` e `152-177`) só
   olham `res.content["application/json"].schema` (OpenAPI 3.x). No
   Swagger 2.0 o schema fica direto em `res.schema`. Resultado: status code
   e descrição aparecem, mas o schema/exemplo do corpo de resposta fica
   sempre vazio pra specs Swagger 2.0.

3. **`consumes`/`produces` (Swagger 2.0) não são lidos.**
   Hoje o content-type do corpo assume sempre `'application/json'`
   implicitamente quando não há `content` (OpenAPI 3.x). Pra manter
   consistência (e cobrir specs que usam XML/form-urlencoded via
   `consumes`), vale ler `op.consumes`/`root.consumes` como fallback de
   content-type — mas isso é secundário: a spec de teste já usa
   `application/json`, então não bloqueia o teste inicial.

4. **`securityDefinitions` (Swagger 2.0) não é lido.**
   `parseSecuritySchemes` (`parser.ts:179-196`) só olha
   `components.securitySchemes`. Pra specs Swagger 2.0 que efetivamente
   usam esse mecanismo (a de teste não usa — `securityDefinitions: {}` e
   trata `Authorization` como header comum, então isso já funciona sem
   mudança nenhuma pra ESSA spec), o botão de auth do Try It não
   apareceria. Vale um fallback lendo `root.securityDefinitions` e
   mapeando pro mesmo formato de `SecurityScheme`, mas não é bloqueante
   pro teste com a URL dada.

## Mudanças propostas

Tudo concentrado em `lib/openapi/parser.ts` + `lib/openapi/types.ts` (a
única "fonte da verdade" que vira `ParsedSpec`/`ParsedOperation` — nenhum
componente de UI precisa mudar, já que todos consomem só a forma já
normalizada):

1. **`types.ts`**: nenhuma mudança em `ParsedParameter['in']` (continua sem
   `'body'` — corpo vira `requestBody`, não fica na lista de parâmetros,
   então o tipo já está certo do jeito que é).

2. **`parser.ts` — extrair parâmetro de corpo pra `requestBody`:**
   Antes de chamar `parseParameters` com a lista combinada
   (`pathParams + opParams`), separar quem tem `in === 'body'`. Se existir
   um (Swagger 2.0 permite no máximo um por operação) **e** `op.requestBody`
   não existir (OpenAPI 3.x manda), montar o `requestBody` a partir dele:
   `{ description: body.description, required: Boolean(body.required),
   contentType: (op.consumes?.[0] ?? root.consumes?.[0] ?? 'application/json'),
   schema: resolveSchema(root, body.schema), example: body.example }`.
   O restante dos parâmetros (sem `in === 'body'`) segue pro
   `parseParameters` normal.

3. **`parser.ts` — ler schema de resposta no formato Swagger 2.0:**
   Em `parseResponses`, se `res.content` não existir mas `res.schema`
   existir, tratar como
   `{ contentType: op.produces?.[0] ?? root.produces?.[0] ?? 'application/json',
   schema: resolveSchema(root, res.schema), example: res.examples?.['application/json'] }`
   (Swagger 2.0 usa `res.examples` chaveado por content-type, em vez de
   `res.example`/`res.examples[].value` do OpenAPI 3.x).

4. **`parser.ts` — `securityDefinitions` (Swagger 2.0) em `parseSecuritySchemes`:**
   Fallback lendo `root.securityDefinitions` quando
   `components.securitySchemes` não existir, mapeando pros mesmos campos
   de `SecurityScheme` (Swagger 2.0 usa `type: 'basic'|'apiKey'|'oauth2'`,
   sem `scheme`/`bearerFormat` — ambos ficam `undefined`, o que já é
   aceito pelo tipo hoje).

## Fora de escopo (não mexer agora)

- `consumes`/`produces` no nível de XML/form-urlencoded (só o fallback de
  content-type descrito acima; não vou adicionar serialização especial
  pra esses tipos).
- `oauth2` flows do Swagger 2.0 (`securityDefinitions` com
  `flow`/`authorizationUrl`/`scopes`) — o Try It de hoje não tem UI pra
  OAuth2 nem no OpenAPI 3.x, então fica igual (fora de escopo pros dois
  formatos).
- Mudar `components/api-hub/try-it.tsx`, `param-table.tsx`,
  `code-samples.ts` — não deveriam precisar de nenhuma mudança, já que
  todos consomem só `ParsedOperation` já normalizado. Vou confirmar isso
  na validação, mas se algo quebrar ali é sinal de que a normalização no
  parser ficou incompleta.

## Validação

1. Testes unitários novos em `lib/openapi/parser.test.ts` (ou onde já
   existir suíte do parser) cobrindo: parâmetro `in: "body"` virando
   `requestBody`; resposta com `schema` direto virando
   `ParsedResponse.schema`; `securityDefinitions` virando
   `securitySchemes`. Usar um fixture mínimo Swagger 2.0 (não precisa ser
   o JSON real de 60KB inteiro).
2. `npm test` (suíte unitária, sem precisar de Postgres).
3. Ponta a ponta manual: subir `npm run dev`, logar, carregar
   `https://www.rhid.com.br/v2/swagger.svc/swagger.json` pela UI (Cmd+K →
   colar URL), abrir uma operação POST (ex: `/alterarvalidadelicenca`),
   confirmar que o campo "Body" aparece com o schema/exemplo certo, e que
   a seção de resposta mostra o schema do 200. Não vou de fato disparar o
   "Testar endpoint" contra esse servidor real (é uma API de terceiros com
   auth própria) — só validar que a UI renderiza os campos certos.
4. Regressão: recarregar a spec padrão bundled (`lib/openapi/api-hub-spec.ts`,
   OpenAPI 3.x) e confirmar que nada mudou visualmente (garante que as
   mudanças são aditivas/condicionais ao formato, não quebram o caminho
   OpenAPI 3.x existente).
