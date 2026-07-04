import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { getUserAccess, requiredPermissionFor } from '@/lib/rbac'

// Runtime Node (estável no Next 16) pra consultar o Postgres direto daqui:
// status do usuário + permissões são checados a cada request, então
// desativar/remover um usuário derruba a sessão dele na request seguinte,
// mesmo com o JWT ainda no prazo — sem refresh token nem tabela de sessão.
export const runtime = 'nodejs'

export const config = {
  matcher: [
    '/',
    '/docs/:path*',
    '/change-password',
    '/admin/:path*',
    '/api/me',
    '/api/auth/change-password',
    '/api/spec/:path*',
    '/api/specs/:path*',
    '/api/proxy/:path*',
    '/api/admin/:path*',
    '/config-ia',
    '/api/config-ia/:path*',
    '/api/ai/:path*',
  ],
}

function buildLoginUrl(request: NextRequest) {
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set(
    'next',
    request.nextUrl.pathname + request.nextUrl.search,
  )
  return loginUrl
}

function unauthenticated(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api/')
  const res = isApi
    ? NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    : NextResponse.redirect(buildLoginUrl(request))
  // Sessão inválida (usuário desativado/removido, cookie velho): apaga o
  // cookie na própria resposta — logout forçado, o client não fica
  // re-tentando com um token morto.
  res.cookies.delete(SESSION_COOKIE)
  return res
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token) : null

  if (!session) return unauthenticated(request)

  const access = await getUserAccess(session.sub)
  if (!access || access.status === 'disabled') return unauthenticated(request)

  const { pathname } = request.nextUrl

  // Reset de senha pendente: só deixa passar a própria página de troca, sua
  // API e o logout — qualquer outra rota redireciona pra troca. Usa o valor
  // fresco do banco (não o snapshot do JWT) pra cobrir o caso de um admin
  // resetar a senha de quem já está logado.
  if (access.mustChangePassword) {
    const allowed =
      pathname === '/change-password' || pathname === '/api/auth/change-password'
    if (!allowed) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Troca de senha obrigatória.', code: 'must_change_password' },
          { status: 403 },
        )
      }
      return NextResponse.redirect(new URL('/change-password', request.url))
    }
  }

  const required = requiredPermissionFor(pathname, request.method)
  if (required && !access.permissions.includes(required)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Sem permissão para este recurso.' },
        { status: 403 },
      )
    }
    // Página sem permissão: manda pro hub em vez de uma página de erro.
    return NextResponse.redirect(new URL('/?denied=1', request.url))
  }

  // Repassa identidade+permissões pra rotas/páginas downstream via headers,
  // sempre sobrescrevendo qualquer valor vindo do client (não spoofável).
  const headers = new Headers(request.headers)
  headers.set('x-user-id', access.id)
  headers.set('x-user-name', encodeURIComponent(access.username))
  headers.set('x-user-groups', encodeURIComponent(access.groups.join(',')))
  headers.set('x-user-permissions', access.permissions.join(','))
  return NextResponse.next({ request: { headers } })
}
