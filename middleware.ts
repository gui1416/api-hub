import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

export const config = {
  matcher: [
    '/',
    '/docs/:path*',
    '/api/spec/:path*',
    '/api/specs/:path*',
    '/api/proxy/:path*',
    '/config-ia',
    '/api/config-ia/:path*',
    '/api/ai/:path*',
  ],
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token) : null

  if (session) return NextResponse.next()

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set(
    'next',
    request.nextUrl.pathname + request.nextUrl.search,
  )
  return NextResponse.redirect(loginUrl)
}
