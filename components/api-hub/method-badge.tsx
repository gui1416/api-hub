import { cn } from '@/lib/utils'
import type { HttpMethod } from '@/lib/openapi/types'

const METHOD_STYLES: Record<string, string> = {
  get: 'text-method-get bg-method-get/10 border-method-get/20',
  post: 'text-method-post bg-method-post/10 border-method-post/20',
  put: 'text-method-put bg-method-put/10 border-method-put/20',
  patch: 'text-method-patch bg-method-patch/10 border-method-patch/20',
  delete: 'text-method-delete bg-method-delete/10 border-method-delete/20',
  options: 'text-muted-foreground bg-muted border-border',
  head: 'text-muted-foreground bg-muted border-border',
}

export function MethodBadge({
  method,
  className,
  size = 'sm',
}: {
  method: HttpMethod | string
  className?: string
  size?: 'sm' | 'md'
}) {
  const key = method.toLowerCase()
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-mono font-semibold uppercase tracking-wide',
        size === 'sm' ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-xs',
        METHOD_STYLES[key] ?? METHOD_STYLES.options,
        className,
      )}
    >
      {method}
    </span>
  )
}
