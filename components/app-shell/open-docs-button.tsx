'use client'

import { useCommandPalette } from '@/components/command-palette/command-palette-provider'

/**
 * CTA da home: em vez de navegar direto pra /docs, abre o command palette —
 * o usuário escolhe entre as specs que os grupos dele permitem (a doc padrão
 * do hub aparece na lista como uma spec).
 */
export function OpenDocsButton({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const { openPalette } = useCommandPalette()

  return (
    <button type="button" onClick={openPalette} className={className}>
      {children}
    </button>
  )
}
