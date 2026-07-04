'use client'

import Link from 'next/link'
import { Boxes, Search } from 'lucide-react'
import { LogoutButton } from '@/components/api-hub/logout-button'
import { ThemeToggle } from '@/components/api-hub/theme-toggle'
import { useCommandPalette } from '@/components/command-palette/command-palette-provider'

/**
 * Header compartilhado das telas fora do docs (home, /admin/*, /config-ia,
 * /change-password): marca → hub, título da tela e atalho pro command
 * palette global. O docs continua com o Header próprio (sidebar mobile +
 * título da spec), que abre o mesmo palette.
 */
export function AppHeader({
  title,
  showPalette = true,
}: {
  title?: string
  showPalette?: boolean
}) {
  const { openPalette } = useCommandPalette()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md xl:px-6">
      <Link
        href="/"
        className="flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
          <Boxes className="size-4" />
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            API Hub
          </span>
          {title && (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">/</span>
              <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground sm:inline">
                {title}
              </span>
            </>
          )}
        </div>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        {showPalette && (
          <button
            type="button"
            onClick={openPalette}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Search className="size-3.5" />
            <span className="hidden sm:inline">Navegar</span>
            <kbd className="hidden items-center gap-0.5 rounded border border-border/70 bg-muted px-1 font-mono text-[10px] text-muted-foreground sm:inline-flex">
              ⌘K
            </kbd>
          </button>
        )}
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  )
}
