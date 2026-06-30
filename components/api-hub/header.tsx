'use client'

import {
  Boxes,
  LoaderCircle,
  Menu,
  Link2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { LogoutButton } from './logout-button'
import { ThemeToggle } from './theme-toggle'
import Link from 'next/link'

export function Header({
  title,
  sourceUrl,
  loading,
  onLoad,
  onToggleSidebar,
}: {
  title: string
  sourceUrl: string | null
  loading: boolean
  onLoad: (url: string) => void
  onToggleSidebar: () => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(sourceUrl ?? '')
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed) {
      onLoad(trimmed)
      setOpen(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md xl:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Abrir navegação"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="size-4" />
      </button>

      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
          <Boxes className="size-4" />
        </span>
        <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              API Hub
            </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            /
          </span>
          <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground sm:inline">
            {title}
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              open && 'bg-muted text-foreground',
            )}
          >
            {loading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Link2 className="size-3.5" />
            )}
            <span className="hidden sm:inline">Carregar spec</span>
          </button>

          {open && (
            <div className="absolute right-0 top-10 z-50 w-[min(92vw,420px)] rounded-xl border border-border bg-popover p-4 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Carregar especificação OpenAPI
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                Informe a URL pública do seu documento OpenAPI (JSON ou YAML),
                normalmente em {''}
                <code className="font-mono text-foreground">
                  /openapi.json
                </code>
                .
              </p>
              <form onSubmit={submit} className="space-y-2">
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="https://api.exemplo.com/openapi.json"
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading || !value.trim()}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-brand text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {loading && (
                      <LoaderCircle className="size-4 animate-spin" />
                    )}
                    Gerar documentação
                  </button>
                </div>
              </form>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Experimente:
                </span>
                {[
                  {
                    label: 'Petstore',
                    url: 'https://petstore3.swagger.io/api/v3/openapi.json',
                  },
                ].map((ex) => (
                  <button
                    key={ex.url}
                    type="button"
                    onClick={() => setValue(ex.url)}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  )
}
