'use client'

import { Boxes, Menu, Search } from 'lucide-react'
import { NavUser } from './nav-user'
import { ThemeToggle } from './theme-toggle'

export function Header({
  title,
  onOpenSwitcher,
  onToggleSidebar,
  onHome,
}: {
  title: string
  onOpenSwitcher: () => void
  onToggleSidebar: () => void
  onHome: () => void
}) {
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

      <button
        type="button"
        onClick={onHome}
        className="flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
      >
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
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSwitcher}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Specs</span>
          <kbd className="hidden items-center gap-0.5 rounded border border-border/70 bg-muted px-1 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            ⌘K
          </kbd>
        </button>
        <ThemeToggle />
        <NavUser />
      </div>
    </header>
  )
}
