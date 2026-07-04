import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  groupPermissions,
  groups,
  groupSpecs,
  permissions,
  specs,
  userGroups,
  users,
} from '@/lib/db/schema'
import { isOnline } from '@/lib/auth'
import type {
  DirectoryData,
  DirGroup,
  DirPermission,
  DirSpecOption,
  DirUser,
} from '@/components/admin/directory-console'

/**
 * Carrega tudo que o console de diretório (estilo AD) mostra — usuários,
 * grupos (com membros, permissões e ACL de specs) e o catálogo de
 * permissões. Compartilhado pelas páginas /admin/users e /admin/groups, que
 * renderizam o mesmo console com containers iniciais diferentes.
 */
export async function loadDirectoryData(): Promise<DirectoryData> {
  const [userRows, groupRows, permissionRows, membershipRows, grantRows, specGrantRows, specRows] =
    await Promise.all([
      db.select().from(users).orderBy(asc(users.username)),
      db.select().from(groups).orderBy(asc(groups.name)),
      db.select().from(permissions).orderBy(asc(permissions.key)),
      db
        .select({
          userId: userGroups.userId,
          groupId: userGroups.groupId,
          groupName: groups.name,
        })
        .from(userGroups)
        .innerJoin(groups, eq(groups.id, userGroups.groupId)),
      db
        .select({ groupId: groupPermissions.groupId, permissionId: groupPermissions.permissionId })
        .from(groupPermissions),
      db.select({ groupId: groupSpecs.groupId, specSlug: groupSpecs.specSlug }).from(groupSpecs),
      db.select({ slug: specs.slug, title: specs.title }).from(specs).orderBy(asc(specs.title)),
    ])

  const groupsByUser = new Map<string, Array<{ id: string; name: string }>>()
  const membersByGroup = new Map<string, string[]>()
  for (const row of membershipRows) {
    const list = groupsByUser.get(row.userId) ?? []
    list.push({ id: row.groupId, name: row.groupName })
    groupsByUser.set(row.userId, list)
    const members = membersByGroup.get(row.groupId) ?? []
    members.push(row.userId)
    membersByGroup.set(row.groupId, members)
  }

  const grantsByGroup = new Map<string, string[]>()
  for (const row of grantRows) {
    const list = grantsByGroup.get(row.groupId) ?? []
    list.push(row.permissionId)
    grantsByGroup.set(row.groupId, list)
  }
  const specsByGroup = new Map<string, string[]>()
  for (const row of specGrantRows) {
    const list = specsByGroup.get(row.groupId) ?? []
    list.push(row.specSlug)
    specsByGroup.set(row.groupId, list)
  }

  const dirUsers: DirUser[] = userRows.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    phone: user.phone,
    company: user.company,
    jobTitle: user.jobTitle,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    online: isOnline(user),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    lastLogoutAt: user.lastLogoutAt?.toISOString() ?? null,
    groups: (groupsByUser.get(user.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }))

  const userById = new Map(dirUsers.map((user) => [user.id, user]))
  const dirGroups: DirGroup[] = groupRows.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    isSystem: group.isSystem,
    allSpecs: group.allSpecs,
    hubDocs: group.hubDocs,
    specSlugs: specsByGroup.get(group.id) ?? [],
    permissionIds: grantsByGroup.get(group.id) ?? [],
    members: (membersByGroup.get(group.id) ?? [])
      .map((userId) => userById.get(userId))
      .filter((user): user is DirUser => user !== undefined)
      .map((user) => ({
        id: user.id,
        username: user.username,
        name: user.name,
        status: user.status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))

  const dirPermissions: DirPermission[] = permissionRows.map((permission) => ({
    id: permission.id,
    key: permission.key,
    name: permission.name,
    description: permission.description,
  }))

  const specOptions: DirSpecOption[] = specRows

  return { users: dirUsers, groups: dirGroups, permissions: dirPermissions, specOptions }
}
