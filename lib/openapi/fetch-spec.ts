import { load as loadYaml } from 'js-yaml'

export class FetchSpecError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Fetch and parse a remote OpenAPI/Swagger document (JSON or YAML),
 * validating that it looks like a spec before returning it.
 */
export async function fetchSpec(
  url: string,
): Promise<Record<string, unknown>> {
  let parsedTarget: URL
  try {
    parsedTarget = new URL(url)
  } catch {
    throw new FetchSpecError('URL inválida.', 400)
  }

  if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
    throw new FetchSpecError('Apenas URLs http(s) são suportadas.', 400)
  }

  let upstream: Response
  try {
    upstream = await fetch(parsedTarget.toString(), {
      headers: { Accept: 'application/json, application/yaml, text/yaml, */*' },
      redirect: 'follow',
    })
  } catch (error) {
    throw new FetchSpecError(
      error instanceof Error
        ? `Falha ao buscar a especificação: ${error.message}`
        : 'Falha ao buscar a especificação.',
      502,
    )
  }

  if (!upstream.ok) {
    throw new FetchSpecError(
      `O servidor respondeu com ${upstream.status} ${upstream.statusText}.`,
      502,
    )
  }

  const text = await upstream.text()
  const contentType = upstream.headers.get('content-type') ?? ''

  let doc: unknown
  if (contentType.includes('yaml') || /\.ya?ml($|\?)/i.test(url)) {
    doc = loadYaml(text)
  } else {
    try {
      doc = JSON.parse(text)
    } catch {
      // Some servers serve YAML with a JSON-ish content type.
      doc = loadYaml(text)
    }
  }

  if (!doc || typeof doc !== 'object') {
    throw new FetchSpecError(
      'A resposta não é uma especificação OpenAPI válida.',
      422,
    )
  }

  const obj = doc as Record<string, unknown>
  if (!obj.openapi && !obj.swagger) {
    throw new FetchSpecError(
      'O documento não parece ser uma especificação OpenAPI/Swagger.',
      422,
    )
  }

  return obj
}
