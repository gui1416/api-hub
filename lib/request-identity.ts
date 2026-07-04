import { getSessionFromRequest } from '@/lib/auth'
import { getUserAccess, type UserAccess } from '@/lib/rbac'

export interface RequestUser {
  id: string
  username: string
  groups: string[]
  permissions: string[]
}

/**
 * Identidade do usuário autenticado para rotas atrás do middleware. Lê os
 * headers x-user-* que o middleware injetou (sem ida extra ao banco); se não
 * estiverem presentes (ex: handler invocado direto em teste de integração,
 * sem middleware na frente), cai pro caminho completo: cookie de sessão +
 * resolução de acesso no banco.
 */
export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const id = request.headers.get('x-user-id')
  const username = request.headers.get('x-user-name')
  if (id && username) {
    const groupsHeader = request.headers.get('x-user-groups') ?? ''
    const permissionsHeader = request.headers.get('x-user-permissions') ?? ''
    return {
      id,
      username: decodeURIComponent(username),
      groups: decodeURIComponent(groupsHeader).split(',').filter(Boolean),
      permissions: permissionsHeader.split(',').filter(Boolean),
    }
  }

  const session = await getSessionFromRequest(request)
  if (!session) return null
  const access: UserAccess | null = await getUserAccess(session.sub)
  if (!access || access.status === 'disabled') return null
  return {
    id: access.id,
    username: access.username,
    groups: access.groups,
    permissions: access.permissions,
  }
}
