import { eq } from 'drizzle-orm'
import { db, type DbOrTx } from '@/lib/db/client'
import {
  groupPermissions,
  groups,
  permissions,
  userGroups,
  users,
} from '@/lib/db/schema'

export interface UserAccess {
  id: string
  username: string
  name: string
  status: 'active' | 'disabled'
  mustChangePassword: boolean
  /** Nomes dos grupos do usuário (ex: "Administradores"). */
  groups: string[]
  /** Chaves das permissões efetivas, deduplicadas (ex: "admin.users"). */
  permissions: string[]
  /** ACL da doc padrão do hub: algum grupo com allSpecs ou hubDocs. */
  hubDocs: boolean
}

/**
 * Resolve, numa única ida ao banco, o usuário + grupos + permissões efetivas
 * (users → user_groups → groups → group_permissions → permissions). Retorna
 * null se o usuário não existir (ex: removido depois de logado — a sessão
 * deve ser tratada como inválida pelo chamador).
 */
export async function getUserAccess(
  userId: string,
  tx: DbOrTx = db,
): Promise<UserAccess | null> {
  const rows = await tx
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      groupName: groups.name,
      groupAllSpecs: groups.allSpecs,
      groupHubDocs: groups.hubDocs,
      permissionKey: permissions.key,
    })
    .from(users)
    .leftJoin(userGroups, eq(userGroups.userId, users.id))
    .leftJoin(groups, eq(groups.id, userGroups.groupId))
    .leftJoin(groupPermissions, eq(groupPermissions.groupId, groups.id))
    .leftJoin(permissions, eq(permissions.id, groupPermissions.permissionId))
    .where(eq(users.id, userId))

  if (rows.length === 0) return null

  const groupNames = new Set<string>()
  const permissionKeys = new Set<string>()
  let hubDocs = false
  for (const row of rows) {
    if (row.groupName) groupNames.add(row.groupName)
    if (row.permissionKey) permissionKeys.add(row.permissionKey)
    if (row.groupAllSpecs || row.groupHubDocs) hubDocs = true
  }

  const first = rows[0]
  return {
    id: first.id,
    username: first.username,
    name: first.name,
    status: first.status,
    mustChangePassword: first.mustChangePassword,
    groups: [...groupNames].sort(),
    permissions: [...permissionKeys].sort(),
    hubDocs,
  }
}

/**
 * Mapa de prefixo de rota → permissão exigida, na ordem em que deve ser
 * testado (prefixos mais específicos primeiro). Rotas protegidas pelo
 * middleware que não casam com nenhum prefixo exigem só autenticação.
 */
const ROUTE_PERMISSIONS: Array<{ prefix: string; permission: string; methods?: string[] }> = [
  { prefix: '/admin/users', permission: 'admin.users' },
  { prefix: '/api/admin/users', permission: 'admin.users' },
  { prefix: '/admin/groups', permission: 'admin.groups' },
  { prefix: '/api/admin/groups', permission: 'admin.groups' },
  { prefix: '/api/admin/permissions', permission: 'admin.groups' },
  { prefix: '/admin/dashboard', permission: 'admin.dashboard' },
  { prefix: '/api/admin/dashboard', permission: 'admin.dashboard' },
  { prefix: '/config-ia', permission: 'admin.ai' },
  { prefix: '/api/config-ia', permission: 'admin.ai' },
  { prefix: '/docs', permission: 'docs.view' },
  { prefix: '/api/ai', permission: 'chat.use' },
  // Ações sobre specs são permissões separadas (macro = telas, micro = ações):
  // registrar/atualizar exige specs.load, remover exige specs.delete; o GET
  // (listar, pro switcher e pro @menção do chat) fica liberado pra qualquer
  // autenticado — a lista em si já é filtrada pela ACL por spec na rota.
  { prefix: '/api/specs', permission: 'specs.delete', methods: ['DELETE'] },
  { prefix: '/api/specs', permission: 'specs.load', methods: ['POST', 'PUT', 'PATCH'] },
  { prefix: '/api/spec', permission: 'specs.load' },
  // "Testar endpoint" (proxy) é uma ação própria, separada de ver a doc.
  { prefix: '/api/proxy', permission: 'proxy.use' },
]

/**
 * Retorna a permissão exigida para `pathname`+`method`, ou null se a rota
 * só exige autenticação.
 */
export function requiredPermissionFor(pathname: string, method: string): string | null {
  for (const route of ROUTE_PERMISSIONS) {
    // Match por segmento inteiro: '/api/spec' casa '/api/spec' e
    // '/api/spec/...', mas não '/api/specs'.
    if (pathname !== route.prefix && !pathname.startsWith(`${route.prefix}/`)) continue
    if (route.methods && !route.methods.includes(method.toUpperCase())) continue
    return route.permission
  }
  return null
}
