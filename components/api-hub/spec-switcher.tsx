'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Link2, LoaderCircle, Sparkles, Trash2 } from 'lucide-react'
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

interface SpecSummary {
  slug: string
  sourceUrl: string
  title: string
  description: string | null
  version: string | null
}

const URL_PATTERN = /^https?:\/\/\S+$/i

export function SpecSwitcher({
  open,
  onOpenChange,
  sourceUrl,
  loading,
  onLoad,
  hasAiChat,
  onOpenAiChat,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceUrl: string | null
  loading: boolean
  onLoad: (url: string) => void
  hasAiChat: boolean
  onOpenAiChat: () => void
}) {
  const router = useRouter()
  const [specs, setSpecs] = useState<SpecSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SpecSummary | null>(null)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setListLoading(true)
    fetch('/api/specs')
      .then((res) => res.json())
      .then((data) => setSpecs(data.specs ?? []))
      .catch(() => setSpecs([]))
      .finally(() => setListLoading(false))
  }, [open])

  const handleSelect = useCallback(
    (slug: string) => {
      onOpenChange(false)
      router.push(`/docs/${slug}`)
    },
    [onOpenChange, router],
  )

  const handleLoadNew = useCallback(
    (url: string) => {
      onOpenChange(false)
      onLoad(url)
    },
    [onOpenChange, onLoad],
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
        onOpenChange(false)
        router.push('/docs')
      }
    } finally {
      setDeletingSlug(null)
      setPendingDelete(null)
    }
  }, [pendingDelete, onOpenChange, router, sourceUrl])

  const trimmed = search.trim()
  const isUrl = URL_PATTERN.test(trimmed)
  const alreadyRegistered = specs.some((s) => s.sourceUrl === trimmed)

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Trocar de especificação"
        description="Busque uma spec registrada ou carregue uma nova URL"
      >
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder="Buscar spec ou colar uma URL..."
        />
        <CommandList>
          {listLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Carregando specs...
            </div>
          ) : (
            <>
              <CommandEmpty>Nenhuma spec encontrada.</CommandEmpty>

              {specs.length > 0 && (
                <CommandGroup heading="Specs registradas">
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
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {isUrl && !alreadyRegistered && (
                <>
                  {specs.length > 0 && <CommandSeparator />}
                  <CommandGroup heading="Carregar nova URL">
                    <CommandItem
                      value={trimmed}
                      onSelect={() => handleLoadNew(trimmed)}
                      disabled={loading}
                    >
                      {loading ? (
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
                  {(specs.length > 0 || (isUrl && !alreadyRegistered)) && <CommandSeparator />}
                  <CommandGroup heading="Assistente">
                    <CommandItem
                      value="conversar sobre esta api assistente ia"
                      onSelect={() => {
                        onOpenChange(false)
                        onOpenAiChat()
                      }}
                    >
                      <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                      Conversar sobre esta API
                      <CommandShortcut>Ctrl+I</CommandShortcut>
                    </CommandItem>
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
