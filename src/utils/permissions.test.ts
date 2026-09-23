import { describe, it, expect } from 'vitest'
import { hasPermission, hasRole, canAccessScreen, getDefaultRoute } from './permissions'

describe('hasPermission', () => {
  it('grants owner every permission owners are configured for', () => {
    expect(hasPermission('owner', 'manage_users')).toBe(true)
    expect(hasPermission('owner', 'view_personal_finance')).toBe(true)
    expect(hasPermission('owner', 'view_combined_finance')).toBe(true)
  })

  it('denies a role a permission it is not configured for', () => {
    expect(hasPermission('site_engineer', 'manage_users')).toBe(false)
    expect(hasPermission('designer', 'view_personal_finance')).toBe(false)
  })

  it('grants a permission if ANY assigned role in a multi-role array has it', () => {
    expect(hasPermission(['site_engineer', 'accounts'], 'view_company_finance')).toBe(true)
  })

  it('denies a permission if NO assigned role in a multi-role array has it', () => {
    expect(hasPermission(['site_engineer', 'designer'], 'manage_users')).toBe(false)
  })
})

describe('hasRole', () => {
  it('returns false for a null/undefined user', () => {
    expect(hasRole(null, 'owner')).toBe(false)
    expect(hasRole(undefined, 'owner')).toBe(false)
  })

  it('matches the single active role field when roles[] is absent', () => {
    expect(hasRole({ role: 'owner', roles: undefined }, 'owner')).toBe(true)
    expect(hasRole({ role: 'owner', roles: undefined }, 'accounts')).toBe(false)
  })

  it('matches any role in a multi-role roles[] array', () => {
    expect(hasRole({ role: 'accounts', roles: ['accounts', 'owner'] }, 'owner')).toBe(true)
  })
})

describe('canAccessScreen', () => {
  it('gates personal-finance screens to owner only', () => {
    expect(canAccessScreen('owner', 'personal-finance')).toBe(true)
    expect(canAccessScreen('accounts', 'personal-finance')).toBe(false)
    expect(canAccessScreen('admin', 'combined-finance')).toBe(false)
  })

  it('allows access to a screen with no configured permission requirement', () => {
    expect(canAccessScreen('site_engineer', 'some-unmapped-screen')).toBe(true)
  })

  it('respects multi-role arrays the same way hasPermission does', () => {
    expect(canAccessScreen(['site_engineer', 'owner'], 'personal-finance')).toBe(true)
  })
})

describe('getDefaultRoute', () => {
  it('routes the owner to Home and every other role to their personal Task tab', () => {
    expect(getDefaultRoute('owner')).toBe('/home')
    expect(getDefaultRoute('site_engineer')).toBe('/my-tasks')
    expect(getDefaultRoute('designer')).toBe('/my-tasks')
    expect(getDefaultRoute('qs')).toBe('/my-tasks')
    expect(getDefaultRoute('purchase')).toBe('/my-tasks')
    expect(getDefaultRoute('accounts')).toBe('/my-tasks')
    expect(getDefaultRoute('project_coordinator')).toBe('/my-tasks')
    expect(getDefaultRoute('admin')).toBe('/my-tasks')
  })
})

describe('MD-only screens (Task / Approval)', () => {
  const roles = ['accounts', 'project_coordinator', 'site_engineer', 'designer', 'qs', 'purchase', 'admin'] as const

  it('lets the owner (MD) open the MD Task and Approval screens', () => {
    expect(canAccessScreen('owner', 'md-tasks')).toBe(true)
    expect(canAccessScreen('owner', 'approval')).toBe(true)
  })

  it('keeps every other role out of both screens', () => {
    for (const role of roles) {
      expect(canAccessScreen(role, 'md-tasks')).toBe(false)
      expect(canAccessScreen(role, 'approval')).toBe(false)
    }
  })

  it('does not let a mixed-role user in unless one of the roles is owner', () => {
    expect(canAccessScreen(['designer', 'qs'], 'approval')).toBe(false)
    expect(canAccessScreen(['designer', 'owner'], 'approval')).toBe(true)
  })
})
