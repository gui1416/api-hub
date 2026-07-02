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

export interface AuditEntry {
  action: AuditAction
  actor: string
  status: 'success' | 'failure'
  metadata?: Record<string, unknown>
  /** Used only to extract ip (x-forwarded-for) and user-agent. */
  request?: Request
}

function extractIp(request: Request): string | null {
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
