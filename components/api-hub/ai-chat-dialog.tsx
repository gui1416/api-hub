'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Download, Info, RefreshCw, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import {
  Message,
  MessageContent,
} from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Spinner } from '@/components/ui/spinner'

interface MentionableSpec {
  slug: string
  sourceUrl: string
  title: string
  description: string | null
  version: string | null
}

interface ChatMessage {
  id?: string
  tempId?: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
}

interface StreamEvent {
  type: 'marker' | 'delta' | 'done' | 'error'
  text?: string
  message?: string
  title?: string | null
  [key: string]: unknown
}

// Minimal prose styling for assistant replies — no @tailwindcss/typography
// dependency, just enough to make lists/code/links readable in a chat bubble.
const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children, className }) => {
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) {
      return (
        <code className={cn('block overflow-x-auto rounded-md bg-background/60 p-2 text-xs', className)}>
          {children}
        </code>
      )
    }
    return <code className="rounded bg-background/60 px-1 py-0.5 text-[0.85em]">{children}</code>
  },
  pre: ({ children }) => <pre className="mb-2 overflow-x-auto last:mb-0">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border pl-2 text-muted-foreground last:mb-0">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => <h4 className="mb-1 font-heading text-sm font-semibold">{children}</h4>,
  h2: ({ children }) => <h4 className="mb-1 font-heading text-sm font-semibold">{children}</h4>,
  h3: ({ children }) => <h4 className="mb-1 font-heading text-sm font-semibold">{children}</h4>,
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm wrap-break-word">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

function detectMentionTrigger(value: string, cursor: number): { start: number; query: string } | null {
  const uptoCursor = value.slice(0, cursor)
  const at = uptoCursor.lastIndexOf('@')
  if (at === -1) return null
  const between = uptoCursor.slice(at + 1)
  if (/\s/.test(between)) return null
  const charBefore = at === 0 ? '' : value[at - 1]
  if (at !== 0 && !/\s/.test(charBefore)) return null
  return { start: at, query: between }
}

export function AiChatDialog({
  open,
  onOpenChange,
  sourceUrl,
  specTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceUrl: string
  specTitle: string
}) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversationTitle, setConversationTitle] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [mentionedSpecs, setMentionedSpecs] = useState<MentionableSpec[]>([])
  const [allSpecs, setAllSpecs] = useState<MentionableSpec[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [awaitingResponse, setAwaitingResponse] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionTriggerStart, setMentionTriggerStart] = useState(-1)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionContainerRef = useRef<HTMLDivElement>(null)
  // Text already received over the network but not yet revealed in the UI,
  // plus the bookkeeping for the requestAnimationFrame loop that drains it at
  // a steady pace — decouples how fast the provider streams tokens from how
  // fast they visually "type out", so a very fast provider (e.g. Groq) still
  // feels like a fluid typing animation instead of the text just appearing.
  const pendingRevealRef = useRef('')
  const revealRafRef = useRef<number | null>(null)
  const pendingDoneEventRef = useRef<StreamEvent | null>(null)

  const stopReveal = useCallback(() => {
    if (revealRafRef.current !== null) {
      cancelAnimationFrame(revealRafRef.current)
      revealRafRef.current = null
    }
    pendingRevealRef.current = ''
    pendingDoneEventRef.current = null
  }, [])

  useEffect(() => stopReveal, [stopReveal])

  const startReveal = useCallback(
    (tempId: string) => {
      if (revealRafRef.current !== null) return
      const tick = () => {
        const pending = pendingRevealRef.current
        if (pending.length > 0) {
          // Reveal a handful of characters per frame, scaling up when a big
          // backlog has piled up so a long response doesn't take forever to
          // finish "typing" after the network has already delivered it.
          const chunkSize = Math.max(2, Math.ceil(pending.length / 20))
          const chunk = pending.slice(0, chunkSize)
          pendingRevealRef.current = pending.slice(chunkSize)
          setMessages((prev) =>
            prev.map((m) => (m.tempId === tempId ? { ...m, content: m.content + chunk } : m)),
          )
          revealRafRef.current = requestAnimationFrame(tick)
          return
        }

        const doneEvent = pendingDoneEventRef.current
        if (doneEvent) {
          pendingDoneEventRef.current = null
          revealRafRef.current = null
          setStreaming(false)
          if (doneEvent.title) setConversationTitle(doneEvent.title)
          return
        }

        // Nothing to reveal yet, but the stream isn't done — keep polling.
        revealRafRef.current = requestAnimationFrame(tick)
      }
      revealRafRef.current = requestAnimationFrame(tick)
    },
    [],
  )

  // Load (or create) the most recent conversation for this spec, and its
  // messages, whenever the dialog opens or the spec changes.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function init() {
      setLoadingConversation(true)
      try {
        const listRes = await fetch(`/api/ai/conversations?sourceUrl=${encodeURIComponent(sourceUrl)}`)
        const listData = await listRes.json()
        let conversation = listData.conversations?.[0] as
          | { id: string; title: string | null }
          | undefined

        if (!conversation) {
          const createRes = await fetch('/api/ai/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceUrl }),
          })
          const createData = await createRes.json()
          conversation = createData.conversation
        }

        if (cancelled || !conversation) return
        setConversationId(conversation.id)
        setConversationTitle(conversation.title ?? null)
        setMentionedSpecs([])

        const msgsRes = await fetch(`/api/ai/conversations/${conversation.id}/messages`)
        const msgsData = await msgsRes.json()
        if (cancelled) return
        const loaded = (msgsData.messages ?? []) as Array<{
          id: string
          role: 'user' | 'assistant'
          content: string
        }>
        setMessages(loaded.map((m) => ({ id: m.id, role: m.role, content: m.content })))
      } catch {
        if (!cancelled) toast.error('Não foi possível carregar a conversa.')
      } finally {
        if (!cancelled) setLoadingConversation(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [open, sourceUrl])

  // Fetch the registered spec list once per open, for the @mention popover.
  useEffect(() => {
    if (!open) return
    fetch('/api/specs')
      .then((res) => res.json())
      .then((data) => setAllSpecs(data.specs ?? []))
      .catch(() => setAllSpecs([]))
  }, [open])

  useEffect(() => {
    if (mentionQuery === null) return
    function handleClickOutside(e: MouseEvent) {
      if (!mentionContainerRef.current?.contains(e.target as Node)) {
        setMentionQuery(null)
        setMentionTriggerStart(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mentionQuery])

  const handleNewConversation = useCallback(async () => {
    try {
      stopReveal()
      setStreaming(false)
      const res = await fetch('/api/ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl }),
      })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setConversationId(data.conversation.id)
      setConversationTitle(data.conversation.title ?? null)
      setMessages([])
      setMentionedSpecs([])
      setInput('')
    } catch {
      toast.error('Não foi possível criar uma nova conversa.')
    }
  }, [sourceUrl, stopReveal])

  const handleRefreshContext = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/context/invalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl }),
      })
      if (!res.ok) throw new Error('failed')
      toast.success('Contexto atualizado.')
    } catch {
      toast.error('Não foi possível atualizar o contexto.')
    }
  }, [sourceUrl])

  const handleExport = useCallback(() => {
    const lines = ['# Conversa', '']
    for (const m of messages) {
      if (m.role !== 'user' && m.role !== 'assistant') continue
      lines.push(m.role === 'user' ? '**Você:**' : '**Assistente:**', '', m.content, '')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const safeTitle =
      specTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'api'
    const a = document.createElement('a')
    a.href = url
    a.download = `conversa-${safeTitle}-${new Date().toISOString().slice(0, 10)}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [messages, specTitle])

  const removeMention = useCallback((slug: string) => {
    setMentionedSpecs((prev) => prev.filter((s) => s.slug !== slug))
  }, [])

  const updateMentionState = useCallback((value: string, cursor: number) => {
    const trigger = detectMentionTrigger(value, cursor)
    if (trigger) {
      setMentionQuery(trigger.query)
      setMentionTriggerStart(trigger.start)
    } else {
      setMentionQuery(null)
      setMentionTriggerStart(-1)
    }
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setInput(value)
      updateMentionState(value, e.target.selectionStart ?? value.length)
    },
    [updateMentionState],
  )

  const handleSelectionChange = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.currentTarget
      updateMentionState(target.value, target.selectionStart ?? target.value.length)
    },
    [updateMentionState],
  )

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return allSpecs.filter(
      (s) =>
        s.sourceUrl !== sourceUrl &&
        !mentionedSpecs.some((m) => m.slug === s.slug) &&
        (s.title.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)),
    )
  }, [allSpecs, mentionQuery, mentionedSpecs, sourceUrl])

  const closeMentionPopover = useCallback(() => {
    setMentionQuery(null)
    setMentionTriggerStart(-1)
  }, [])

  const handleMentionSelect = useCallback(
    (spec: MentionableSpec) => {
      if (mentionTriggerStart === -1) return
      const cursor = textareaRef.current?.selectionStart ?? input.length
      const before = input.slice(0, mentionTriggerStart)
      const after = input.slice(cursor)
      const nextValue = `${before}${after}`
      setInput(nextValue)
      setMentionedSpecs((prev) => (prev.some((s) => s.slug === spec.slug) ? prev : [...prev, spec]))
      closeMentionPopover()
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        const pos = before.length
        el.setSelectionRange(pos, pos)
      })
    },
    [mentionTriggerStart, input, closeMentionPopover],
  )

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || streaming || !conversationId) return

    setMessages((prev) => [...prev, { role: 'user', content }])
    setInput('')
    closeMentionPopover()
    setStreaming(true)
    setAwaitingResponse(true)
    stopReveal()

    // Local to this call (not a ref mutated inside a setState updater —
    // React Strict Mode double-invokes updaters in dev, which would create
    // the assistant message on the first invocation, discard it because the
    // second invocation runs against the original `prev`, and then leave
    // every subsequent delta patching a tempId that was never inserted).
    let assistantTempId: string | null = null
    let receivedTerminalEvent = false

    const mentionedSlugs = mentionedSpecs.map((s) => s.slug)

    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mentionedSpecIds: mentionedSlugs }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Não foi possível enviar a mensagem.')
        setStreaming(false)
        setAwaitingResponse(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          let event: StreamEvent
          try {
            event = JSON.parse(line)
          } catch {
            continue
          }

          setAwaitingResponse(false)

          if (event.type === 'delta') {
            const text = event.text ?? ''
            if (assistantTempId === null) {
              assistantTempId = crypto.randomUUID()
              const newTempId = assistantTempId
              setMessages((prev) => [...prev, { tempId: newTempId, role: 'assistant', content: '' }])
              pendingRevealRef.current += text
              startReveal(newTempId)
            } else {
              pendingRevealRef.current += text
            }
          } else if (event.type === 'marker') {
            setMessages((prev) => [...prev, { role: 'system', content: event.text ?? '' }])
          } else if (event.type === 'done') {
            receivedTerminalEvent = true
            if (assistantTempId === null) {
              // No content was ever streamed (shouldn't normally happen) —
              // nothing for the reveal loop to finish, so finalize directly.
              setStreaming(false)
              if (event.title) setConversationTitle(event.title)
            } else {
              // Let the reveal loop finish typing out whatever's still
              // pending before flipping `streaming` back off.
              pendingDoneEventRef.current = event
            }
          } else if (event.type === 'error') {
            receivedTerminalEvent = true
            // Terminal event — flush whatever was still queued immediately
            // rather than let it keep "typing" after the stream is over.
            stopReveal()
            if (assistantTempId !== null && pendingRevealRef.current) {
              const tempId = assistantTempId
              const rest = pendingRevealRef.current
              setMessages((prev) =>
                prev.map((m) => (m.tempId === tempId ? { ...m, content: m.content + rest } : m)),
              )
            }
            setStreaming(false)
            setMessages((prev) => [
              ...prev,
              { role: 'error', content: event.message ?? 'Erro ao gerar a resposta.' },
            ])
          }
        }
      }

      if (!receivedTerminalEvent) {
        // The connection closed without a `done`/`error` line (e.g. the
        // server crashed mid-stream) — don't leave the UI stuck "typing"
        // forever.
        stopReveal()
        if (assistantTempId !== null && pendingRevealRef.current) {
          const tempId = assistantTempId
          const rest = pendingRevealRef.current
          setMessages((prev) =>
            prev.map((m) => (m.tempId === tempId ? { ...m, content: m.content + rest } : m)),
          )
        }
        setStreaming(false)
      }
    } catch {
      stopReveal()
      toast.error('Erro de rede ao enviar a mensagem.')
      setStreaming(false)
    } finally {
      setAwaitingResponse(false)
    }
  }, [input, streaming, conversationId, mentionedSpecs, closeMentionPopover, stopReveal, startReveal])

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionQuery !== null && e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeMentionPopover()
        return
      }
      if (mentionQuery !== null && e.key === 'Enter' && !e.shiftKey && mentionCandidates.length > 0) {
        e.preventDefault()
        handleMentionSelect(mentionCandidates[0])
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    },
    [mentionQuery, mentionCandidates, handleMentionSelect, handleSend, closeMentionPopover],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[70vh] max-h-[70vh] w-full flex-col sm:max-w-2xl">
        <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 pr-8">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{conversationTitle || 'Nova conversa'}</DialogTitle>
            <DialogDescription className="truncate">{specTitle}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Atualizar contexto"
              aria-label="Atualizar contexto"
              onClick={handleRefreshContext}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Exportar Markdown"
              aria-label="Exportar Markdown"
              onClick={handleExport}
              disabled={messages.length === 0}
            >
              <Download className="size-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleNewConversation}>
              Nova conversa
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {loadingConversation ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : (
            <MessageScrollerProvider>
              <MessageScroller className="h-full">
                <MessageScrollerViewport>
                  <MessageScrollerContent>
                    {messages.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Envie uma mensagem para começar a conversar sobre esta API.
                      </p>
                    )}
                    {messages.map((m, i) => (
                      <MessageScrollerItem key={m.id ?? m.tempId ?? i}>
                        {m.role === 'system' || m.role === 'error' ? (
                          <Marker>
                            <MarkerIcon>
                              {m.role === 'error' ? (
                                <AlertCircle className="text-destructive" />
                              ) : (
                                <Info />
                              )}
                            </MarkerIcon>
                            <MarkerContent>{m.content}</MarkerContent>
                          </Marker>
                        ) : (
                          <Message align={m.role === 'user' ? 'end' : 'start'}>
                            <MessageContent>
                              <div
                                className={cn(
                                  'max-w-[85%] rounded-lg px-3 py-2',
                                  m.role === 'user'
                                    ? 'ml-auto whitespace-pre-wrap bg-primary text-primary-foreground'
                                    : 'mr-auto bg-muted text-foreground',
                                )}
                              >
                                {m.role === 'assistant' ? (
                                  <AssistantMarkdown content={m.content} />
                                ) : (
                                  m.content
                                )}
                              </div>
                            </MessageContent>
                          </Message>
                        )}
                      </MessageScrollerItem>
                    ))}
                    {awaitingResponse && (
                      <MessageScrollerItem>
                        <Message align="start">
                          <MessageContent>
                            <div className="mr-auto flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-muted-foreground">
                              <Spinner className="size-4" />
                            </div>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
              </MessageScroller>
            </MessageScrollerProvider>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{specTitle} (principal)</Badge>
            {mentionedSpecs.map((s) => (
              <Badge key={s.slug} variant="outline" className="gap-1 pr-1">
                + {s.title}
                <button
                  type="button"
                  aria-label={`Remover menção a ${s.title}`}
                  onClick={() => removeMention(s.slug)}
                  className="rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div ref={mentionContainerRef} className="relative">
            {mentionQuery !== null && (
              <div className="absolute bottom-full left-0 z-10 mb-1 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-md ring-1 ring-foreground/10">
                <Command shouldFilter={false}>
                  <CommandList>
                    <CommandEmpty>Nenhuma spec encontrada.</CommandEmpty>
                    {mentionCandidates.length > 0 && (
                      <CommandGroup heading="Mencionar spec">
                        {mentionCandidates.map((s) => (
                          <CommandItem key={s.slug} value={s.slug} onSelect={() => handleMentionSelect(s)}>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate">{s.title}</span>
                              <span className="truncate text-[11px] text-muted-foreground">{s.slug}</span>
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </div>
            )}

            <InputGroup className="h-auto items-end">
              <InputGroupTextarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onSelect={handleSelectionChange}
                onKeyUp={handleSelectionChange}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Pergunte sobre a API... use @ para mencionar outra spec"
                disabled={streaming || loadingConversation || !conversationId}
                rows={2}
              />
              <InputGroupAddon align="block-end">
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  onClick={() => void handleSend()}
                  disabled={streaming || !input.trim()}
                  aria-label="Enviar mensagem"
                >
                  <Send className="size-4" />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
