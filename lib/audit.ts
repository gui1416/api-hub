import { db, type DbOrTx } from '@/lib/db/client'
import { auditLogs } from '@/lib/db/schema'

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'spec.created'
  | 'spec.updated'
  | 'spec.deleted'
  | 'proxy.request'
  | 'ai.config_updated'
  | 'ai.provider_created'
  | 'ai.provider_updated'
  | 'ai.provider_deleted'
  | 'user.created'
  | 'user.updated'
  | 'user.activated'
  | 'user.deactivated'
  | 'user.deleted'
  | 'user.password_reset'
  | 'user.password_changed'
  | 'user.groups_updated'
  | 'group.created'
  | 'group.updated'
  | 'group.deleted'
  | 'group.permissions_updated'
  | 'group.specs_updated'
  | 'group.members_updated'
  | 'permission.created'
  | 'permission.deleted'

/**
 * Só o suficiente pra extrair ip/user-agent — um `Request` de verdade
 * satisfaz isso estruturalmente (todo call site em route handler já passa um
 * direto), mas também deixa passar o retorno de `headers()` do
 * `next/headers` embrulhado em `{ headers }`, usado por Server Components
 * (ex: o resync passivo de specs em app/docs/[slug]/page.tsx).
 */
export interface AuditRequestLike {
  headers: { get(name: string): string | null }
}

export interface AuditEntry {
  action: AuditAction
  actor: string
  status: 'success' | 'failure'
  metadata?: Record<string, unknown>
  /** Used only to extract ip (x-forwarded-for) and user-agent. */
  request?: AuditRequestLike
}

function extractIp(request: AuditRequestLike): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip')
}

/**
 * Records an audit log entry. Throws if the insert fails — audit trail
 * completeness is prioritized over availability, so callers must treat a
 * failed insert as a failure of the action being audited (strict mode).
 */
export async function logAudit(entry: AuditEntry, tx: DbOrTx = db): Promise<void> {
  try {
    await tx.insert(auditLogs).values({
      action: entry.action,
      actor: entry.actor,
      status: entry.status,
      metadata: entry.metadata ?? null,
      ip: entry.request ? extractIp(entry.request) : null,
      userAgent: entry.request?.headers.get('user-agent') ?? null,
    })
  } catch (err) {
    // TODO(debug): remove once the production audit_logs insert failure is
    // root-caused — callers swallow this into a generic 500, so without
    // this it's invisible in logs.
    console.error('[audit] insert failed:', err)
    throw err
  }
}
