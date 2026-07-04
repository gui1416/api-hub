'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  BookOpen,
  Boxes,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
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
import { extractSpecInfo } from '@/lib/openapi/spec-info'
import { useSession } from '@/components/session-provider'
import { useCommandPalette } from './command-palette-provider'

interface SpecSummary {
  slug: string
  sourceUrl: string
  title: string
  description: string | null
  version: string | null
}

const URL_PATTERN = /^https?:\/\/\S+$/i

// Entradas administrativas do palette — cada uma só aparece pra quem tem a
// permissão correspondente (a UI esconde; a garantia real é o middleware).
const ADMIN_ITEMS = [
  { label: 'Gestão de usuários', href: '/admin/users', permission: 'admin.users', icon: Users },
  { label: 'Grupos e permissões', href: '/admin/groups', permission: 'admin.groups', icon: Shield },
  { label: 'Gestão de IA', href: '/config-ia', permission: 'admin.ai', icon: Settings2 },
  { label: 'Dashboard de uso', href: '/admin/dashboard', permission: 'admin.dashboard', icon: LayoutDashboard },
] as const

/**
 * Command palette global (Cmd+K em qualquer tela autenticada): navegação
 * entre specs (já filtradas pela ACL no GET /api/specs), carga de nova spec
 * (specs.load), remoção (specs.delete), chat de IA (quando registrado pela
 * página de docs) e telas administrativas — tudo gated pelas permissões da
 * sessão. Montado uma única vez pelo CommandPaletteProvider.
 */
export function CommandPalette() {
  const router = useRouter()
  const pathname = usePathname()
  const { open, setOpen, docsContext } = useCommandPalette()
  const { me } = useSession()
  const permissions = me?.permissions ?? []

  const [specs, setSpecs] = useState<SpecSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SpecSummary | null>(null)

  const canViewDocs = permissions.includes('docs.view')
  const canLoadSpecs = permissions.includes('specs.load')
  const canDeleteSpecs = permissions.includes('specs.delete')
  const sourceUrl = docsContext?.sourceUrl ?? null

  useEffect(() => {
    if (!open || !canViewDocs) return
    setSearch('')
    setListLoading(true)
    fetch('/api/specs')
      .then((res) => res.json())
      .then((data) => setSpecs(data.specs ?? []))
      .catch(() => setSpecs([]))
      .finally(() => setListLoading(false))
  }, [open, canViewDocs])

  const handleSelect = useCallback(
    (slug: string) => {
      setOpen(false)
      router.push(`/docs/${slug}`)
    },
    [setOpen, router],
  )

  // Registrar uma spec nova a partir da URL colada na busca — antes vivia no
  // ApiHub; aqui funciona a partir de qualquer tela.
  const loadSpec = useCallback(
    async (url: string) => {
      setLoadingUrl(true)
      try {
        const res = await fetch(`/api/spec?url=${encodeURIComponent(url)}`)
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? 'Não foi possível carregar a especificação.')
          return
        }

        const fetchedSpec = data.spec as Record<string, unknown>
        const { title, description, version } = extractSpecInfo(fetchedSpec, url)

        const registerRes = await fetch('/api/specs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceUrl: url, title, description, version }),
        })
        const registerData = await registerRes.json()
        if (!registerRes.ok) {
          toast.error(registerData.error ?? 'Não foi possível registrar a especificação.')
          return
        }

        toast.success(`Spec "${title}" adicionada com sucesso.`)
        setOpen(false)
        router.push(`/docs/${registerData.slug as string}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro de rede inesperado.')
      } finally {
        setLoadingUrl(false)
      }
    },
    [router, setOpen],
  )

  const handleRequestDelete = useCallback(
    (e: React.MouseEvent, spec: SpecSummary) => {
      e.preventDefault()
      e.stopPropagation()
      setPendingDelete(spec)
    },
    [],
  )

  const handleConfirmDelete = useCallback(async () => {
    const spec = pendingDelete
    if (!spec) return
    setDeletingSlug(spec.slug)
    try {
      const res = await fetch(`/api/specs/${spec.slug}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(`Não foi possível deletar "${spec.title}".`)
        return
      }
      setSpecs((prev) => prev.filter((s) => s.slug !== spec.slug))
      toast.success(`Spec "${spec.title}" deletada com sucesso.`)
      if (spec.sourceUrl === sourceUrl) {
        setOpen(false)
        router.push('/docs')
      }
    } finally {
      setDeletingSlug(null)
      setPendingDelete(null)
    }
  }, [pendingDelete, setOpen, router, sourceUrl])

  const trimmed = search.trim()
  const isUrl = URL_PATTERN.test(trimmed)
  const alreadyRegistered = specs.some((s) => s.sourceUrl === trimmed)
  const adminItems = ADMIN_ITEMS.filter((item) => permissions.includes(item.permission))
  const hasAiChat = docsContext !== null && sourceUrl !== null

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Navegar"
        description="Busque uma spec registrada, cole uma URL nova ou vá para uma tela"
      >
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder="Buscar spec, colar uma URL ou navegar..."
        />
        <CommandList>
          {listLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Carregando specs...
            </div>
          ) : (
            <>
              <CommandEmpty>Nada encontrado.</CommandEmpty>

              {canViewDocs && (
                <CommandGroup heading="Specs registradas">
                  {/* A doc padrão do próprio hub se comporta como uma spec —
                      inclusive na ACL (groups.hubDocs decide quem a vê). */}
                  {(me?.hubDocs ?? false) && (
                    <CommandItem
                      value="documentação do api hub padrão docs"
                      data-checked={pathname === '/docs' && sourceUrl === null}
                      onSelect={() => {
                        setOpen(false)
                        router.push('/docs')
                      }}
                    >
                      <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-foreground">Documentação do API Hub</span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          Spec padrão desta instância
                        </span>
                      </span>
                    </CommandItem>
                  )}
                  {specs.map((spec) => (
                    <CommandItem
                      key={spec.slug}
                      value={`${spec.title} ${spec.sourceUrl}`}
                      data-checked={spec.sourceUrl === sourceUrl}
                      onSelect={() => handleSelect(spec.slug)}
                      className="group/spec-item"
                    >
                      <Boxes className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-foreground">
                          {spec.title}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {spec.sourceUrl}
                        </span>
                      </span>
                      {canDeleteSpecs && (
                        <button
                          type="button"
                          aria-label={`Remover ${spec.title}`}
                          onClick={(e) => handleRequestDelete(e, spec)}
                          disabled={deletingSlug === spec.slug}
                          className="ml-auto hidden shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-method-delete/10 hover:text-method-delete group-hover/spec-item:block disabled:opacity-50"
                        >
                          {deletingSlug === spec.slug ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {canLoadSpecs && isUrl && !alreadyRegistered && (
                <>
                  {canViewDocs && <CommandSeparator />}
                  <CommandGroup heading="Carregar nova URL">
                    <CommandItem
                      value={trimmed}
                      onSelect={() => loadSpec(trimmed)}
                      disabled={loadingUrl}
                    >
                      {loadingUrl ? (
                        <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <Link2 className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">Carregar {trimmed}</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}

              {hasAiChat && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Assistente">
                    <CommandItem
                      value="conversar sobre esta api assistente ia"
                      onSelect={() => {
                        setOpen(false)
                        docsContext?.openAiChat()
                      }}
                    >
                      <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                      Conversar sobre esta API
                      <CommandShortcut>Ctrl+I</CommandShortcut>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}

              {adminItems.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Administração">
                    {adminItems.map((item) => (
                      <CommandItem
                        key={item.href}
                        value={`${item.label} administração`}
                        onSelect={() => {
                          setOpen(false)
                          router.push(item.href)
                        }}
                      >
                        <item.icon className="size-4 shrink-0 text-muted-foreground" />
                        {item.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover spec?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove &quot;{pendingDelete?.title}&quot; da lista de specs
              registradas. A fonte original ({pendingDelete?.sourceUrl}) não é
              afetada — a spec pode ser carregada de novo pela URL a qualquer
              momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSlug === pendingDelete?.slug}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingSlug === pendingDelete?.slug}
              onClick={handleConfirmDelete}
            >
              {deletingSlug === pendingDelete?.slug ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
