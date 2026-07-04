'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'
import { CommandPalette } from './command-palette'

/**
 * Contexto que a página de docs registra pro palette: qual spec está aberta
 * (sourceUrl) e como abrir o chat de IA sobre ela. Fora do docs fica null e o
 * grupo "Assistente" não aparece.
 */
export interface DocsPaletteContext {
  sourceUrl: string | null
  openAiChat: () => void
}

interface CommandPaletteContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  openPalette: () => void
  docsContext: DocsPaletteContext | null
  setDocsContext: (ctx: DocsPaletteContext | null) => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  open: false,
  setOpen: () => {},
  openPalette: () => {},
  docsContext: null,
  setDocsContext: () => {},
})

export function useCommandPalette() {
  return useContext(CommandPaletteContext)
}

// Telas onde o palette não deve existir: sem sessão (login) ou com navegação
// bloqueada pelo middleware (troca de senha obrigatória).
const DISABLED_PATHS = ['/login', '/change-password']

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [docsContext, setDocsContext] = useState<DocsPaletteContext | null>(null)
  const disabled = DISABLED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )

  const openPalette = useCallback(() => setOpen(true), [])

  // Cmd/Ctrl+K global — em qualquer tela autenticada, não só no docs.
  useEffect(() => {
    if (disabled) return
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [disabled])

  const value = useMemo(
    () => ({ open, setOpen, openPalette, docsContext, setDocsContext }),
    [open, openPalette, docsContext],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {!disabled && <CommandPalette />}
    </CommandPaletteContext.Provider>
  )
}
