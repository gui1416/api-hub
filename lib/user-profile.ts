// Validação/normalização dos campos de perfil de usuário, compartilhada
// entre POST /api/admin/users (criação) e PATCH /api/admin/users/:id (edição).

// Pragmática (algo@algo.tld) — a garantia real de unicidade é o UNIQUE do banco.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ProfileFields {
  name: string
  email: string
  phone: string | null
  company: string | null
  jobTitle: string | null
}

/**
 * Normaliza e valida os campos de perfil de um payload. Retorna
 * `{ error }` com mensagem pt-BR quando inválido. Campos opcionais vazios
 * viram null.
 */
export function parseProfileFields(payload: {
  name?: unknown
  email?: unknown
  phone?: unknown
  company?: unknown
  jobTitle?: unknown
}): { fields: ProfileFields } | { error: string } {
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!name) return { error: 'O campo "name" é obrigatório.' }

  const email =
    typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!email) return { error: 'O campo "email" é obrigatório.' }
  if (!EMAIL_PATTERN.test(email)) return { error: 'Email inválido.' }

  const optional = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null

  return {
    fields: {
      name,
      email,
      phone: optional(payload.phone),
      company: optional(payload.company),
      jobTitle: optional(payload.jobTitle),
    },
  }
}
