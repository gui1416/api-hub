export interface SpecInfo {
  title: string
  description: string | null
  version: string | null
}

/**
 * Pull the metadata we persist per registered spec (title/description/version)
 * out of a raw OpenAPI/Swagger document's `info` object.
 */
export function extractSpecInfo(
  rawSpec: Record<string, unknown>,
  fallbackTitle: string,
): SpecInfo {
  const info = (rawSpec.info as Record<string, unknown> | undefined) ?? {}
  const title = typeof info.title === 'string' && info.title ? info.title : fallbackTitle
  const description = typeof info.description === 'string' ? info.description : null
  const version = typeof info.version === 'string' ? info.version : null
  return { title, description, version }
}
