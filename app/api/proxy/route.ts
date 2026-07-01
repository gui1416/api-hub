import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

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

  const session = await getSessionFromRequest(request)
  const actor = session?.sub ?? 'anonymous'
  const upperMethod = method.toUpperCase()
  const targetUrl = target.toString()

  const started = Date.now()
  try {
    const upstream = await fetch(targetUrl, {
      method: upperMethod,
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

    // The outbound call already happened by this point and can't be undone,
    // so a failed audit insert still surfaces as a 500 to the client — the
    // client only sees a proxy result once its audit trail is durable.
    try {
      await logAudit({
        action: 'proxy.request',
        actor,
        status: 'success',
        metadata: {
          method: upperMethod,
          url: targetUrl,
          status: upstream.status,
          durationMs: elapsed,
        },
        request,
      })
    } catch {
      return NextResponse.json(
        { error: 'Falha ao registrar auditoria. Tente novamente.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
      body: responseText,
      durationMs: elapsed,
    })
  } catch (error) {
    const elapsed = Date.now() - started

    try {
      await logAudit({
        action: 'proxy.request',
        actor,
        status: 'failure',
        metadata: { method: upperMethod, url: targetUrl, durationMs: elapsed },
        request,
      })
    } catch {
      return NextResponse.json(
        { error: 'Falha ao registrar auditoria. Tente novamente.' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `A requisição falhou: ${error.message}`
            : 'A requisição falhou.',
        durationMs: elapsed,
      },
      { status: 502 },
    )
  }
}
