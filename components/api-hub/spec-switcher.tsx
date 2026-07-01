'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Link2, LoaderCircle, Trash2 } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceUrl: string | null
  loading: boolean
  onLoad: (url: string) => void
}) {
  const router = useRouter()
  const [specs, setSpecs] = useState<SpecSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)

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

  const handleDelete = useCallback(
    async (e: React.MouseEvent, spec: SpecSummary) => {
      e.preventDefault()
      e.stopPropagation()
      setDeletingSlug(spec.slug)
      try {
        const res = await fetch(`/api/specs/${spec.slug}`, { method: 'DELETE' })
        if (!res.ok) return
        setSpecs((prev) => prev.filter((s) => s.slug !== spec.slug))
        if (spec.sourceUrl === sourceUrl) {
          onOpenChange(false)
          router.push('/docs')
        }
      } finally {
        setDeletingSlug(null)
      }
    },
    [onOpenChange, router, sourceUrl],
  )

  const trimmed = search.trim()
  const isUrl = URL_PATTERN.test(trimmed)
  const alreadyRegistered = specs.some((s) => s.sourceUrl === trimmed)

  return (
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
                      onClick={(e) => handleDelete(e, spec)}
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
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
