import { Fragment, type ReactNode } from 'react'

const TOKEN_REGEX =
  /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g

/**
 * Lightweight JSON syntax highlighter. Tokenizes a JSON string and wraps
 * keys, strings, numbers and literals in themed spans.
 */
export function highlightJson(code: string): ReactNode {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of code.matchAll(TOKEN_REGEX)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      nodes.push(
        <span key={key++} className="text-code-punctuation">
          {code.slice(lastIndex, index)}
        </span>,
      )
    }

    const token = match[0]
    let className = 'text-code-number'

    if (token.startsWith('"')) {
      className = match[2] ? 'text-code-key' : 'text-code-string'
    } else if (token === 'true' || token === 'false') {
      className = 'text-code-boolean'
    } else if (token === 'null') {
      className = 'text-code-boolean'
    }

    nodes.push(
      <span key={key++} className={className}>
        {token}
      </span>,
    )
    lastIndex = index + token.length
  }

  if (lastIndex < code.length) {
    nodes.push(
      <span key={key++} className="text-code-punctuation">
        {code.slice(lastIndex)}
      </span>,
    )
  }

  return <Fragment>{nodes}</Fragment>
}
