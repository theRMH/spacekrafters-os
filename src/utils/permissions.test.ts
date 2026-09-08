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
  it('routes each role to its configured landing screen', () => {
    expect(getDefaultRoute('owner')).toBe('/home')
    expect(getDefaultRoute('site_engineer')).toBe('/tasks')
    expect(getDefaultRoute('designer')).toBe('/design')
    expect(getDefaultRoute('qs')).toBe('/quotations')
    expect(getDefaultRoute('purchase')).toBe('/procurement')
  })
})
