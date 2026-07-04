'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BookOpen,
  Boxes,
  Check,
  Copy,
  FolderTree,
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSession } from '@/components/session-provider'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Tipos compartilhados com lib/admin/directory-data.ts (server).

export interface DirUser {
  id: string
  username: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  jobTitle: string | null
  status: 'active' | 'disabled'
  mustChangePassword: boolean
  online: boolean
  lastLoginAt: string | null
  lastLogoutAt: string | null
  groups: Array<{ id: string; name: string }>
}

export interface DirGroup {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  allSpecs: boolean
  /** ACL da doc padrão do hub (pseudo-spec; só relevante com allSpecs=false). */
  hubDocs: boolean
  specSlugs: string[]
  permissionIds: string[]
  members: Array<{ id: string; username: string; name: string; status: 'active' | 'disabled' }>
}

export interface DirPermission {
  id: string
  key: string
  name: string
  description: string | null
}

export interface DirSpecOption {
  slug: string
  title: string
}

export interface DirectoryData {
  users: DirUser[]
  groups: DirGroup[]
  permissions: DirPermission[]
  specOptions: DirSpecOption[]
}

export type DirectoryContainer = 'users' | 'groups' | 'permissions'

// ---------------------------------------------------------------------------
// Constantes / helpers (herdados dos antigos users-manager/groups-manager).

const PROTECTED_KEYS = new Set([
  'admin.users',
  'admin.groups',
  'admin.ai',
  'admin.dashboard',
  'specs.load',
  'specs.delete',
  'proxy.use',
  'docs.view',
  'chat.use',
])

// Macro (telas/rotas) vs micro (ações) — permissões criadas pela UI caem em
// "Personalizadas". Derivado da chave no client; o catálogo no banco é plano.
const SCREEN_KEYS = new Set(['docs.view', 'admin.users', 'admin.groups', 'admin.ai', 'admin.dashboard'])
const ACTION_KEYS = new Set(['specs.load', 'specs.delete', 'proxy.use', 'chat.use'])

function categorizePermissions(permissions: DirPermission[]) {
  const screens: DirPermission[] = []
  const actions: DirPermission[] = []
  const custom: DirPermission[] = []
  for (const permission of permissions) {
    if (SCREEN_KEYS.has(permission.key)) screens.push(permission)
    else if (ACTION_KEYS.has(permission.key)) actions.push(permission)
    else custom.push(permission)
  }
  return [
    { heading: 'Telas (rotas)', items: screens },
    { heading: 'Ações', items: actions },
    { heading: 'Personalizadas', items: custom },
  ].filter((section) => section.items.length > 0)
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ProfileFormState {
  name: string
  email: string
  phone: string
  company: string
  jobTitle: string
}

const EMPTY_PROFILE: ProfileFormState = { name: '', email: '', phone: '', company: '', jobTitle: '' }

function profileFromUser(user: DirUser): ProfileFormState {
  return {
    name: user.name,
    email: user.email ?? '',
    phone: user.phone ?? '',
    company: user.company ?? '',
    jobTitle: user.jobTitle ?? '',
  }
}

function ProfileFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: ProfileFormState
  onChange: (next: ProfileFormState) => void
}) {
  const set = (field: keyof ProfileFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value })

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Nome</Label>
        <Input id={`${idPrefix}-name`} value={value.name} onChange={set('name')} placeholder="ex: Maria Silva" autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input id={`${idPrefix}-email`} type="email" value={value.email} onChange={set('email')} placeholder="ex: maria@empresa.com" autoComplete="off" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-phone`}>Telefone (opcional)</Label>
          <Input id={`${idPrefix}-phone`} value={value.phone} onChange={set('phone')} placeholder="ex: (11) 99999-0000" autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-company`}>Empresa (opcional)</Label>
          <Input id={`${idPrefix}-company`} value={value.company} onChange={set('company')} autoComplete="off" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-job-title`}>Cargo (opcional)</Label>
        <Input id={`${idPrefix}-job-title`} value={value.jobTitle} onChange={set('jobTitle')} autoComplete="off" />
      </div>
    </>
  )
}

function TempPasswordDialog({
  state,
  onClose,
}: {
  state: { username: string; password: string } | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (state) setCopied(false)
  }, [state])

  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Senha temporária</DialogTitle>
          <DialogDescription>
            Copie e repasse ao usuário <strong>{state?.username}</strong> — ela não será exibida de
            novo. No primeiro login será exigida a troca.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
            {state?.password}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Copiar senha temporária"
            onClick={async () => {
              if (!state) return
              await navigator.clipboard.writeText(state.password)
              setCopied(true)
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Concluído
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CheckList<T extends { id: string }>({
  items,
  selected,
  onToggle,
  renderLabel,
  emptyText,
}: {
  items: T[]
  selected: Set<string>
  onToggle: (id: string) => void
  renderLabel: (item: T) => React.ReactNode
  emptyText: string
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.has(item.id)}
            onChange={() => onToggle(item.id)}
            className="mt-0.5 size-4 accent-brand"
          />
          {renderLabel(item)}
        </label>
      ))}
    </div>
  )
}

function toggleIn(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

// ---------------------------------------------------------------------------
// Console de diretório, no espírito do "Active Directory Users and Computers":
// árvore de containers à esquerda, lista de objetos com busca à direita,
// duplo clique (ou menu da linha) abre "Propriedades" com abas.

export function DirectoryConsole({
  data,
  initialContainer,
}: {
  data: DirectoryData
  initialContainer: DirectoryContainer
}) {
  const router = useRouter()
  const { me } = useSession()
  const myPermissions = me?.permissions ?? []

  const containers = useMemo(
    () =>
      [
        { id: 'users' as const, label: 'Usuários', icon: Users, count: data.users.length, permission: 'admin.users' },
        { id: 'groups' as const, label: 'Grupos', icon: Shield, count: data.groups.length, permission: 'admin.groups' },
        { id: 'permissions' as const, label: 'Permissões', icon: KeyRound, count: data.permissions.length, permission: 'admin.groups' },
      ].filter((node) => myPermissions.includes(node.permission)),
    [data, myPermissions],
  )

  const [container, setContainer] = useState<DirectoryContainer>(initialContainer)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  // Propriedades de usuário
  const [userProps, setUserProps] = useState<DirUser | null>(null)
  const [userProfile, setUserProfile] = useState<ProfileFormState>(EMPTY_PROFILE)
  const [userGroupIds, setUserGroupIds] = useState<Set<string>>(new Set())

  // Propriedades de grupo
  const [groupProps, setGroupProps] = useState<DirGroup | null>(null)
  const [groupGeneral, setGroupGeneral] = useState({ name: '', description: '' })
  const [groupPermissionIds, setGroupPermissionIds] = useState<Set<string>>(new Set())
  const [groupMemberIds, setGroupMemberIds] = useState<Set<string>>(new Set())
  const [groupAllSpecs, setGroupAllSpecs] = useState(true)
  const [groupHubDocs, setGroupHubDocs] = useState(true)
  const [groupSpecSlugs, setGroupSpecSlugs] = useState<Set<string>>(new Set())

  // Criação / confirmações
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createUsername, setCreateUsername] = useState('')
  const [createProfile, setCreateProfile] = useState<ProfileFormState>(EMPTY_PROFILE)
  const [createGroups, setCreateGroups] = useState<Set<string>>(new Set())
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [createGroupForm, setCreateGroupForm] = useState({ name: '', description: '' })
  const [permissionForm, setPermissionForm] = useState<{ name: string; description: string } | null>(null)
  const [deleteUserTarget, setDeleteUserTarget] = useState<DirUser | null>(null)
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<DirGroup | null>(null)
  const [deletePermissionTarget, setDeletePermissionTarget] = useState<DirPermission | null>(null)
  const [resetTarget, setResetTarget] = useState<DirUser | null>(null)
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string } | null>(null)

  const query = search.trim().toLowerCase()
  const filteredUsers = useMemo(
    () =>
      data.users.filter(
        (user) =>
          !query ||
          user.name.toLowerCase().includes(query) ||
          user.username.toLowerCase().includes(query) ||
          (user.email ?? '').toLowerCase().includes(query),
      ),
    [data.users, query],
  )
  const filteredGroups = useMemo(
    () =>
      data.groups.filter(
        (group) =>
          !query ||
          group.name.toLowerCase().includes(query) ||
          (group.description ?? '').toLowerCase().includes(query),
      ),
    [data.groups, query],
  )
  const filteredPermissions = useMemo(
    () =>
      data.permissions.filter(
        (permission) =>
          !query ||
          permission.key.toLowerCase().includes(query) ||
          permission.name.toLowerCase().includes(query),
      ),
    [data.permissions, query],
  )

  function openUserProps(user: DirUser) {
    setUserProps(user)
    setUserProfile(profileFromUser(user))
    setUserGroupIds(new Set(user.groups.map((group) => group.id)))
  }

  function openGroupProps(group: DirGroup) {
    setGroupProps(group)
    setGroupGeneral({ name: group.name, description: group.description ?? '' })
    setGroupPermissionIds(new Set(group.permissionIds))
    setGroupMemberIds(new Set(group.members.map((member) => member.id)))
    setGroupAllSpecs(group.allSpecs)
    setGroupHubDocs(group.hubDocs)
    setGroupSpecSlugs(new Set(group.specSlugs))
  }

  // -------------------------------------------------------------------------
  // Ações (fetch + router.refresh; as listas renderizam direto das props).

  async function saveUserProps() {
    const target = userProps
    if (!target || !userProfile.name.trim() || !userProfile.email.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userProfile, groupIds: [...userGroupIds] }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Não foi possível salvar as propriedades.')
        return
      }
      toast.success(`Propriedades de "${target.username}" salvas.`)
      setUserProps(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function toggleUserStatus(target: DirUser) {
    const nextStatus = target.status === 'active' ? 'disabled' : 'active'
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Não foi possível atualizar o status.')
        return
      }
      toast.success(
        nextStatus === 'active'
          ? `Conta "${target.username}" ativada.`
          : `Conta "${target.username}" desativada.`,
      )
      // Mantém o dialog coerente sem esperar o refresh.
      setUserProps((prev) => (prev && prev.id === target.id ? { ...prev, status: nextStatus } : prev))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword() {
    const target = resetTarget
    if (!target) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${target.id}/reset-password`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Não foi possível resetar a senha.')
        return
      }
      setResetTarget(null)
      setTempPassword({ username: target.username, password: data.temporaryPassword })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function deleteUser() {
    const target = deleteUserTarget
    if (!target) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Não foi possível remover o usuário.')
        return
      }
      toast.success(`Usuário "${target.username}" removido.`)
      setDeleteUserTarget(null)
      setUserProps((prev) => (prev && prev.id === target.id ? null : prev))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function createUser() {
    const username = createUsername.trim()
    if (!username || !createProfile.name.trim() || !createProfile.email.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, ...createProfile, groupIds: [...createGroups] }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Não foi possível criar o usuário.')
        return
      }
      setCreateUserOpen(false)
      setCreateUsername('')
      setCreateProfile(EMPTY_PROFILE)
      setCreateGroups(new Set())
      setTempPassword({ username: data.username, password: data.temporaryPassword })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function saveGroupProps() {
    const target = groupProps
    if (!target || !groupGeneral.name.trim()) return
    setBusy(true)
    try {
      const [generalRes, permsRes, membersRes, specsRes] = await Promise.all([
        fetch(`/api/admin/groups/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: groupGeneral.name, description: groupGeneral.description }),
        }),
        fetch(`/api/admin/groups/${target.id}/permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissionIds: [...groupPermissionIds] }),
        }),
        fetch(`/api/admin/groups/${target.id}/members`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: [...groupMemberIds] }),
        }),
        fetch(`/api/admin/groups/${target.id}/specs`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            allSpecs: groupAllSpecs,
            hubDocs: groupAllSpecs ? true : groupHubDocs,
            specSlugs: groupAllSpecs ? [] : [...groupSpecSlugs],
          }),
        }),
      ])
      const failed = [generalRes, permsRes, membersRes, specsRes].find((res) => !res.ok)
      if (failed) {
        const data = await failed.json().catch(() => null)
        toast.error(data?.error ?? 'Não foi possível salvar todas as propriedades do grupo.')
        return
      }
      toast.success(`Propriedades de "${groupGeneral.name}" salvas.`)
      setGroupProps(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function createGroup() {
    if (!createGroupForm.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createGroupForm),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Não foi possível criar o grupo.')
        return
      }
      toast.success(`Grupo "${createGroupForm.name}" criado — abra as Propriedades para configurar permissões, membros e specs.`)
      setCreateGroupOpen(false)
      setCreateGroupForm({ name: '', description: '' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function deleteGroup() {
    const target = deleteGroupTarget
    if (!target) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/groups/${target.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Não foi possível remover o grupo.')
        return
      }
      toast.success(`Grupo "${target.name}" removido.`)
      setDeleteGroupTarget(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function createPermission() {
    const form = permissionForm
    if (!form || !form.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Não foi possível criar a permissão.')
        return
      }
      toast.success(`Permissão "${data.key}" criada.`)
      setPermissionForm(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function deletePermission() {
    const target = deletePermissionTarget
    if (!target) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/permissions/${target.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Não foi possível remover a permissão.')
        return
      }
      toast.success(`Permissão "${target.key}" removida.`)
      setDeletePermissionTarget(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  // -------------------------------------------------------------------------

  const containerLabel =
    container === 'users' ? 'Usuários' : container === 'groups' ? 'Grupos' : 'Permissões'

  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 xl:px-6">
      {/* Árvore de containers (estilo consoles MMC/ADUC) */}
      <aside className="hidden w-56 shrink-0 sm:block">
        <div className="rounded-lg border border-border p-2">
          <div className="flex items-center gap-2 px-2 py-1.5 text-[13px] font-semibold text-foreground">
            <FolderTree className="size-4 text-muted-foreground" />
            API Hub
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {containers.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => {
                    setContainer(node.id)
                    setSearch('')
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-6 text-left text-[13px] transition-colors',
                    container === node.id
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <node.icon className="size-4 shrink-0" />
                  <span className="flex-1">{node.label}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{node.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 px-2 text-[11px] leading-relaxed text-muted-foreground">
          Duplo clique num objeto abre as Propriedades.
        </p>
      </aside>

      {/* Painel de objetos */}
      <main className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-heading text-xl font-semibold text-foreground">{containerLabel}</h1>
            <p className="text-sm text-muted-foreground">
              {container === 'users' && 'Contas do diretório: perfil, status, grupos e senha.'}
              {container === 'groups' && 'Grupos concedem permissões e acesso a specs aos seus membros.'}
              {container === 'permissions' && 'Catálogo de permissões atribuíveis aos grupos.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Buscar em ${containerLabel.toLowerCase()}...`}
                className="h-8 w-56 pl-8 text-[13px]"
              />
            </div>
            {/* Container móvel (a árvore some em telas pequenas) */}
            <div className="sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground"
                >
                  <FolderTree className="size-3.5" />
                  {containerLabel}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {containers.map((node) => (
                    <DropdownMenuItem key={node.id} onClick={() => setContainer(node.id)}>
                      <node.icon className="size-4" />
                      {node.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {container === 'users' && (
              <Button type="button" size="sm" onClick={() => setCreateUserOpen(true)}>
                <Plus className="size-4" />
                Novo usuário
              </Button>
            )}
            {container === 'groups' && (
              <Button type="button" size="sm" onClick={() => setCreateGroupOpen(true)}>
                <Plus className="size-4" />
                Novo grupo
              </Button>
            )}
            {container === 'permissions' && (
              <Button type="button" size="sm" onClick={() => setPermissionForm({ name: '', description: '' })}>
                <Plus className="size-4" />
                Nova permissão
              </Button>
            )}
          </div>
        </div>

        {container === 'users' && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Nome</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Grupos</th>
                  <th className="px-3 py-2.5 font-medium">Último login</th>
                  <th className="px-3 py-2.5 text-right font-medium" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    onDoubleClick={() => openUserProps(user)}
                    className="cursor-default select-none border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <User className="size-4" />
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background',
                              user.online ? 'bg-method-get' : 'bg-muted-foreground/40',
                            )}
                            title={user.online ? 'Online' : 'Offline'}
                          />
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-foreground">{user.name}</span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {user.username}
                            {(user.jobTitle || user.company) &&
                              ` · ${[user.jobTitle, user.company].filter(Boolean).join(' · ')}`}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                      {user.email ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={user.status === 'active' ? 'secondary' : 'destructive'}>
                          {user.status === 'active' ? 'Ativo' : 'Desativado'}
                        </Badge>
                        {user.mustChangePassword && <Badge variant="outline">trocar senha</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {user.groups.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          user.groups.map((group) => (
                            <Badge key={group.id} variant="outline">
                              {group.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateTime(user.lastLoginAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Ações para ${user.username}`}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openUserProps(user)}>
                            <User className="size-4" />
                            Propriedades
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void toggleUserStatus(user)}>
                            <ShieldCheck className="size-4" />
                            {user.status === 'active' ? 'Desativar conta' : 'Ativar conta'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setResetTarget(user)}>
                            <KeyRound className="size-4" />
                            Resetar senha...
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteUserTarget(user)}
                          >
                            <Trash2 className="size-4" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {container === 'groups' && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Nome</th>
                  <th className="px-3 py-2.5 font-medium">Descrição</th>
                  <th className="px-3 py-2.5 font-medium">Membros</th>
                  <th className="px-3 py-2.5 font-medium">Permissões</th>
                  <th className="px-3 py-2.5 font-medium">Specs</th>
                  <th className="px-3 py-2.5 text-right font-medium" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {filteredGroups.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Nenhum grupo encontrado.
                    </td>
                  </tr>
                )}
                {filteredGroups.map((group) => (
                  <tr
                    key={group.id}
                    onDoubleClick={() => openGroupProps(group)}
                    className="cursor-default select-none border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Users className="size-4" />
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">{group.name}</span>
                          {group.isSystem && <Badge variant="outline">sistema</Badge>}
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                      {group.description ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {group.members.length}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {group.permissionIds.length}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline">
                        {group.allSpecs
                          ? 'todas'
                          : `${group.specSlugs.length + (group.hubDocs ? 1 : 0)} spec(s)`}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Ações para ${group.name}`}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openGroupProps(group)}>
                            <Users className="size-4" />
                            Propriedades
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={group.isSystem}
                            onClick={() => setDeleteGroupTarget(group)}
                          >
                            <Trash2 className="size-4" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {container === 'permissions' && (
          <ul className="flex flex-col gap-2">
            {filteredPermissions.length === 0 && (
              <li className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nenhuma permissão encontrada.
              </li>
            )}
            {filteredPermissions.map((permission) => (
              <li key={permission.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                      {permission.key}
                    </code>
                    <span className="text-sm text-foreground">{permission.name}</span>
                    {PROTECTED_KEYS.has(permission.key) && <Badge variant="outline">sistema</Badge>}
                  </div>
                  {permission.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{permission.description}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Remover permissão ${permission.key}`}
                  disabled={PROTECTED_KEYS.has(permission.key)}
                  onClick={() => setDeletePermissionTarget(permission)}
                  className="hover:bg-method-delete/10 hover:text-method-delete"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Propriedades de usuário (abas Geral / Conta / Membro de) */}
      <Dialog open={userProps !== null} onOpenChange={(next) => !next && setUserProps(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Propriedades de {userProps?.username}</DialogTitle>
            <DialogDescription>
              Perfil, conta e grupos — como as propriedades de um usuário no AD.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">Geral</TabsTrigger>
              <TabsTrigger value="account">Conta</TabsTrigger>
              <TabsTrigger value="member-of">Membro de</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="pt-3">
              <div className="flex flex-col gap-4">
                <ProfileFields idPrefix="props" value={userProfile} onChange={setUserProfile} />
              </div>
            </TabsContent>
            <TabsContent value="account" className="pt-3">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Username
                    </p>
                    <p className="mt-0.5 font-mono text-[13px] text-foreground">{userProps?.username}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Situação
                    </p>
                    <p className="mt-0.5 text-[13px] text-foreground">
                      {userProps?.online ? 'Online' : 'Offline'}
                      {userProps?.mustChangePassword ? ' · troca de senha pendente' : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Último login
                    </p>
                    <p className="mt-0.5 text-[13px] text-foreground">
                      {formatDateTime(userProps?.lastLoginAt ?? null)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Último logout
                    </p>
                    <p className="mt-0.5 text-[13px] text-foreground">
                      {formatDateTime(userProps?.lastLogoutAt ?? null)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Conta ativa</p>
                    <p className="text-xs text-muted-foreground">
                      Desativar derruba a sessão na próxima request.
                    </p>
                  </div>
                  <Switch
                    checked={userProps?.status === 'active'}
                    disabled={busy || !userProps}
                    onCheckedChange={() => userProps && void toggleUserStatus(userProps)}
                    aria-label="Conta ativa"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => userProps && setResetTarget(userProps)}
                  >
                    <KeyRound className="size-3.5" />
                    Resetar senha...
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => userProps && setDeleteUserTarget(userProps)}
                    className="hover:bg-method-delete/10 hover:text-method-delete"
                  >
                    <Trash2 className="size-3.5" />
                    Remover usuário...
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="member-of" className="pt-3">
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                <CheckList
                  items={data.groups}
                  selected={userGroupIds}
                  onToggle={(id) => setUserGroupIds((prev) => toggleIn(prev, id))}
                  emptyText="Nenhum grupo cadastrado."
                  renderLabel={(group) => (
                    <span className="flex items-center gap-1.5">
                      <span className="text-foreground">{group.name}</span>
                      {group.isSystem && <Badge variant="outline">sistema</Badge>}
                    </span>
                  )}
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUserProps(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || !userProfile.name.trim() || !userProfile.email.trim()}
              onClick={() => void saveUserProps()}
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Propriedades de grupo (abas Geral / Membros / Permissões / Specs) */}
      <Dialog open={groupProps !== null} onOpenChange={(next) => !next && setGroupProps(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Propriedades de {groupProps?.name}</DialogTitle>
            <DialogDescription>
              Membros, permissões (telas e ações) e acesso a specs deste grupo.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">Geral</TabsTrigger>
              <TabsTrigger value="members">Membros</TabsTrigger>
              <TabsTrigger value="permissions">Permissões</TabsTrigger>
              <TabsTrigger value="specs">Specs</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="pt-3">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="group-props-name">Nome</Label>
                  <Input
                    id="group-props-name"
                    value={groupGeneral.name}
                    onChange={(e) => setGroupGeneral((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="group-props-description">Descrição</Label>
                  <Input
                    id="group-props-description"
                    value={groupGeneral.description}
                    onChange={(e) =>
                      setGroupGeneral((prev) => ({ ...prev, description: e.target.value }))
                    }
                  />
                </div>
                {groupProps?.isSystem && (
                  <p className="text-xs text-muted-foreground">
                    Grupo de sistema: não pode ser removido (nome/descrição podem ser editados).
                  </p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="members" className="pt-3">
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                <CheckList
                  items={data.users}
                  selected={groupMemberIds}
                  onToggle={(id) => setGroupMemberIds((prev) => toggleIn(prev, id))}
                  emptyText="Nenhum usuário cadastrado."
                  renderLabel={(user) => (
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 text-foreground">
                        {user.name}
                        {user.status === 'disabled' && <Badge variant="destructive">desativado</Badge>}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{user.username}</span>
                    </span>
                  )}
                />
              </div>
            </TabsContent>
            <TabsContent value="permissions" className="pt-3">
              <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
                {categorizePermissions(data.permissions).map((section) => (
                  <div key={section.heading} className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {section.heading}
                    </span>
                    <CheckList
                      items={section.items}
                      selected={groupPermissionIds}
                      onToggle={(id) => setGroupPermissionIds((prev) => toggleIn(prev, id))}
                      emptyText=""
                      renderLabel={(permission) => (
                        <span className="flex flex-col">
                          <span className="text-foreground">{permission.name}</span>
                          <code className="font-mono text-[11px] text-muted-foreground">
                            {permission.key}
                          </code>
                        </span>
                      )}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="specs" className="pt-3">
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={groupAllSpecs}
                    onChange={() => setGroupAllSpecs((prev) => !prev)}
                    className="size-4 accent-brand"
                  />
                  <span className="text-foreground">Todas as specs</span>
                </label>
                {!groupAllSpecs && (
                  <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pl-6">
                    {/* Pseudo-spec: a doc padrão do hub (/docs). */}
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={groupHubDocs}
                        onChange={() => setGroupHubDocs((prev) => !prev)}
                        className="size-4 accent-brand"
                      />
                      <span className="flex items-center gap-1.5 truncate text-foreground">
                        <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
                        Documentação do API Hub
                        <span className="text-[11px] text-muted-foreground">(doc padrão)</span>
                      </span>
                    </label>
                    {data.specOptions.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        Nenhuma outra spec registrada ainda.
                      </span>
                    ) : (
                      data.specOptions.map((spec) => (
                        <label key={spec.slug} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={groupSpecSlugs.has(spec.slug)}
                            onChange={() => setGroupSpecSlugs((prev) => toggleIn(prev, spec.slug))}
                            className="size-4 accent-brand"
                          />
                          <span className="flex items-center gap-1.5 truncate text-foreground">
                            <Boxes className="size-3.5 shrink-0 text-muted-foreground" />
                            {spec.title}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGroupProps(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || !groupGeneral.name.trim()}
              onClick={() => void saveGroupProps()}
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo usuário */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              Uma senha temporária será gerada — o usuário troca no primeiro login. Sem grupo
              selecionado, entra no grupo &quot;Usuários&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-username">Username</Label>
              <Input
                id="new-username"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                placeholder="ex: maria.silva"
                autoComplete="off"
              />
            </div>
            <ProfileFields idPrefix="new" value={createProfile} onChange={setCreateProfile} />
            <div className="flex flex-col gap-1.5">
              <Label>Grupos</Label>
              <CheckList
                items={data.groups}
                selected={createGroups}
                onToggle={(id) => setCreateGroups((prev) => toggleIn(prev, id))}
                emptyText="Nenhum grupo cadastrado."
                renderLabel={(group) => <span className="text-foreground">{group.name}</span>}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateUserOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                busy || !createUsername.trim() || !createProfile.name.trim() || !createProfile.email.trim()
              }
              onClick={() => void createUser()}
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Criar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo grupo */}
      <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo grupo</DialogTitle>
            <DialogDescription>
              Depois de criar, abra as Propriedades para definir membros, permissões e specs.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-group-name">Nome</Label>
              <Input
                id="new-group-name"
                value={createGroupForm.name}
                onChange={(e) => setCreateGroupForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-group-description">Descrição</Label>
              <Input
                id="new-group-description"
                value={createGroupForm.description}
                onChange={(e) =>
                  setCreateGroupForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateGroupOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || !createGroupForm.name.trim()}
              onClick={() => void createGroup()}
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Criar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nova permissão */}
      <Dialog open={permissionForm !== null} onOpenChange={(next) => !next && setPermissionForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova permissão</DialogTitle>
            <DialogDescription>
              A chave é gerada a partir do nome (ex: &quot;Relatórios financeiros&quot; →
              <code className="ml-1 font-mono text-xs">relatorios-financeiros</code>).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="permission-name">Nome</Label>
              <Input
                id="permission-name"
                value={permissionForm?.name ?? ''}
                onChange={(e) =>
                  setPermissionForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="permission-description">Descrição</Label>
              <Input
                id="permission-description"
                value={permissionForm?.description ?? ''}
                onChange={(e) =>
                  setPermissionForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPermissionForm(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || !permissionForm?.name.trim()}
              onClick={() => void createPermission()}
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Criar permissão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmações */}
      <AlertDialog open={resetTarget !== null} onOpenChange={(next) => !next && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar a senha de {resetTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              A senha atual deixa de funcionar imediatamente. Uma senha temporária será gerada e
              exibida uma única vez; o usuário precisará trocá-la no próximo login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void resetPassword()}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : 'Resetar senha'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteUserTarget !== null}
        onOpenChange={(next) => !next && setDeleteUserTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {deleteUserTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta deixa de existir e o login com esse username para de funcionar. As conversas
              de IA do usuário são preservadas como &quot;usuário removido&quot; no dashboard. Se a
              intenção for só suspender o acesso, prefira desativar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void deleteUser()}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteGroupTarget !== null}
        onOpenChange={(next) => !next && setDeleteGroupTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o grupo {deleteGroupTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {deleteGroupTarget?.members.length} usuário(s) deste grupo perdem as permissões
              concedidas por ele (as contas não são afetadas).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void deleteGroup()}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletePermissionTarget !== null}
        onOpenChange={(next) => !next && setDeletePermissionTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a permissão {deletePermissionTarget?.key}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os grupos que concedem esta permissão deixam de concedê-la imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => void deletePermission()}
            >
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TempPasswordDialog state={tempPassword} onClose={() => setTempPassword(null)} />
    </div>
  )
}
