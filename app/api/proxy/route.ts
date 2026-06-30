import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

interface ProxyRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

export async function POST(request: Request) {
  let payload: ProxyRequest
  try {
    payload = (await request.json()) as ProxyRequest
  } catch {
    return NextResponse.json(
      { error: 'Corpo da requisição inválido.' },
      { status: 400 },
    )
  }

  const { method, url, headers = {}, body } = payload

  if (!url || !method) {
    return NextResponse.json(
      { error: 'Os campos "method" e "url" são obrigatórios.' },
      { status: 400 },
    )
  }

  let target: URL
  try {
    target = new URL(url)
  } catch {
    return NextResponse.json(
      { error: 'URL de destino inválida.' },
      { status: 400 },
    )
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return NextResponse.json(
      { error: 'Apenas requisições http(s) são suportadas.' },
      { status: 400 },
    )
  }

  const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase()) && body

  const started = Date.now()
  try {
    const upstream = await fetch(target.toString(), {
      method: method.toUpperCase(),
      headers,
      body: hasBody ? body : undefined,
      redirect: 'follow',
    })
    const elapsed = Date.now() - started

    const responseText = await upstream.text()
    const responseHeaders: Record<string, string> = {}
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return NextResponse.json({
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
      body: responseText,
      durationMs: elapsed,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `A requisição falhou: ${error.message}`
            : 'A requisição falhou.',
        durationMs: Date.now() - started,
      },
      { status: 502 },
    )
  }
}
