import { describe, expect, it } from 'vitest'
import { requiredPermissionFor } from './rbac'

describe('requiredPermissionFor', () => {
  it('maps admin pages and APIs to their permissions', () => {
    expect(requiredPermissionFor('/admin/users', 'GET')).toBe('admin.users')
    expect(requiredPermissionFor('/api/admin/users/abc', 'DELETE')).toBe('admin.users')
    expect(requiredPermissionFor('/admin/groups', 'GET')).toBe('admin.groups')
    expect(requiredPermissionFor('/api/admin/permissions', 'POST')).toBe('admin.groups')
    expect(requiredPermissionFor('/admin/dashboard', 'GET')).toBe('admin.dashboard')
    expect(requiredPermissionFor('/api/admin/dashboard/usage', 'GET')).toBe('admin.dashboard')
    expect(requiredPermissionFor('/config-ia', 'GET')).toBe('admin.ai')
    expect(requiredPermissionFor('/api/config-ia/settings', 'PUT')).toBe('admin.ai')
  })

  it('gates docs and chat', () => {
    expect(requiredPermissionFor('/docs', 'GET')).toBe('docs.view')
    expect(requiredPermissionFor('/docs/rhid', 'GET')).toBe('docs.view')
    expect(requiredPermissionFor('/api/ai/conversations', 'POST')).toBe('chat.use')
  })

  it('gates spec actions separately (load vs delete) but not spec listing', () => {
    expect(requiredPermissionFor('/api/specs', 'POST')).toBe('specs.load')
    expect(requiredPermissionFor('/api/specs/rhid', 'DELETE')).toBe('specs.delete')
    // GET /api/specs (listar pro switcher/@menção) só exige autenticação —
    // a lista já vem filtrada pela ACL por spec na própria rota.
    expect(requiredPermissionFor('/api/specs', 'GET')).toBeNull()
    // /api/spec (fetch+validate de URL nova) é parte do fluxo de registrar.
    expect(requiredPermissionFor('/api/spec', 'GET')).toBe('specs.load')
  })

  it('does not confuse /api/spec with /api/specs (segment-aware prefix)', () => {
    // GET /api/specs não pode cair no prefixo /api/spec.
    expect(requiredPermissionFor('/api/specs', 'GET')).toBeNull()
    expect(requiredPermissionFor('/api/spec/anything', 'GET')).toBe('specs.load')
  })

  it('gates the try-it proxy behind proxy.use', () => {
    expect(requiredPermissionFor('/api/proxy', 'POST')).toBe('proxy.use')
  })

  it('returns null for routes that only require authentication', () => {
    expect(requiredPermissionFor('/', 'GET')).toBeNull()
    expect(requiredPermissionFor('/api/me', 'GET')).toBeNull()
    expect(requiredPermissionFor('/change-password', 'GET')).toBeNull()
  })
})
