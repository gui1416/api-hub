export type HttpMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'options'
  | 'head'

export interface OpenAPIInfo {
  title?: string
  version?: string
  description?: string
  termsOfService?: string
  contact?: { name?: string; url?: string; email?: string }
  license?: { name?: string; url?: string }
}

export interface OpenAPIServer {
  url: string
  description?: string
  variables?: Record<string, { default?: string; enum?: string[] }>
}

export interface OpenAPITag {
  name: string
  description?: string
}

// Loose schema type — OpenAPI schemas are highly recursive and varied.
export type JSONSchema = {
  type?: string | string[]
  format?: string
  title?: string
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: unknown[]
  example?: unknown
  examples?: unknown[]
  default?: unknown
  nullable?: boolean
  deprecated?: boolean
  allOf?: JSONSchema[]
  oneOf?: JSONSchema[]
  anyOf?: JSONSchema[]
  additionalProperties?: boolean | JSONSchema
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  $ref?: string
  [key: string]: unknown
}

export interface ParsedParameter {
  name: string
  in: 'query' | 'header' | 'path' | 'cookie'
  description?: string
  required?: boolean
  deprecated?: boolean
  schema?: JSONSchema
  example?: unknown
}

export interface ParsedRequestBody {
  description?: string
  required?: boolean
  contentType: string
  schema?: JSONSchema
  example?: unknown
}

export interface ParsedResponse {
  status: string
  description?: string
  contentType?: string
  schema?: JSONSchema
  example?: unknown
}

export interface ParsedOperation {
  id: string
  method: HttpMethod
  path: string
  summary?: string
  description?: string
  operationId?: string
  deprecated?: boolean
  tags: string[]
  parameters: ParsedParameter[]
  requestBody?: ParsedRequestBody
  responses: ParsedResponse[]
  security?: Record<string, string[]>[]
}

export interface TagGroup {
  name: string
  description?: string
  operations: ParsedOperation[]
}

export interface SecurityScheme {
  key: string
  type?: string
  scheme?: string
  name?: string
  in?: string
  bearerFormat?: string
  description?: string
}

export interface ParsedSpec {
  info: OpenAPIInfo
  servers: OpenAPIServer[]
  groups: TagGroup[]
  operations: ParsedOperation[]
  securitySchemes: SecurityScheme[]
  raw: Record<string, unknown>
}
