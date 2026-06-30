'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { highlightJson } from './json-highlight'

export function CodeBlock({
  code,
  language = 'plain',
  className,
  maxHeight,
}: {
  code: string
  language?: 'json' | 'plain'
  className?: string
  maxHeight?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className={cn('group relative', className)}>
      <button
        type="button"
        onClick={copy}
        aria-label="Copiar código"
        className="absolute right-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground opacity-0 backdrop-blur transition-all hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
      >
        {copied ? (
          <Check className="size-3.5 text-method-post" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <pre
        className="scrollbar-thin overflow-auto p-4 font-mono text-[12.5px] leading-relaxed"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code className="block whitespace-pre">
          {language === 'json' ? highlightJson(code) : code}
        </code>
      </pre>
    </div>
  )
}
