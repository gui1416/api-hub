'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { parseOpenAPI } from '@/lib/openapi/parser'
import { apiHubSpec } from '@/lib/openapi/api-hub-spec'
import type { ParsedOperation } from '@/lib/openapi/types'
import { useCommandPalette } from '@/components/command-palette/command-palette-provider'
import { AiChatDialog } from './ai-chat-dialog'
import { EndpointView } from './endpoint-view'
import { Header } from './header'
import { Overview } from './overview'
import { Sidebar } from './sidebar'

export function ApiHub({
  initialRawSpec,
  initialSourceUrl,
}: {
  initialRawSpec?: Record<string, unknown>
  initialSourceUrl?: string | null
} = {}) {
  const rawSpec = initialRawSpec ?? apiHubSpec
  const sourceUrl = initialSourceUrl ?? null
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const { openPalette, setDocsContext } = useCommandPalette()

  // Registra no palette global qual spec está aberta e como abrir o chat —
  // o grupo "Assistente" do palette só existe enquanto o docs está montado.
  useEffect(() => {
    setDocsContext({ sourceUrl, openAiChat: () => setAiChatOpen(true) })
    return () => setDocsContext(null)
  }, [sourceUrl, setDocsContext])

  // Cmd+K é do palette global (provider); aqui fica só o atalho do chat.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        if (!sourceUrl) return
        e.preventDefault()
        setAiChatOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sourceUrl])

  const spec = useMemo(() => parseOpenAPI(rawSpec), [rawSpec])

  const selectedOperation = useMemo(
    () => spec.operations.find((op) => op.id === selectedId) ?? null,
    [spec.operations, selectedId],
  )

  const handleSelect = useCallback((op: ParsedOperation) => {
    setSelectedId(op.id)
    setMobileNavOpen(false)
    const main = document.getElementById('apihub-content')
    if (main) main.scrollTo({ top: 0 })
  }, [])

  const handleHome = useCallback(() => {
    setSelectedId(null)
    setMobileNavOpen(false)
  }, [])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Header
        title={spec.info.title ?? 'Documentação'}
        onOpenSwitcher={openPalette}
        onToggleSidebar={() => setMobileNavOpen((v) => !v)}
        onHome={handleHome}
      />

      {sourceUrl && (
        <AiChatDialog
          open={aiChatOpen}
          onOpenChange={setAiChatOpen}
          sourceUrl={sourceUrl}
          specTitle={spec.info.title ?? 'API'}
        />
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 shrink-0 border-r border-border lg:block">
          <Sidebar
            spec={spec}
            selectedId={selectedId}
            onSelect={handleSelect}
            onHome={handleHome}
          />
        </aside>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-72 border-r border-border bg-sidebar shadow-xl">
              <Sidebar
                spec={spec}
                selectedId={selectedId}
                onSelect={handleSelect}
                onHome={handleHome}
              />
            </aside>
          </div>
        )}

        <main
          id="apihub-content"
          className={cn('scrollbar-thin min-w-0 flex-1 overflow-y-auto')}
        >
          {selectedOperation ? (
            <EndpointView
              operation={selectedOperation}
              spec={spec}
              sourceUrl={sourceUrl}
            />
          ) : (
            <Overview spec={spec} onSelect={handleSelect} />
          )}
        </main>
      </div>
    </div>
  )
}
