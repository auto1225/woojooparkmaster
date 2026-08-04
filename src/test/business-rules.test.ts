import { describe, expect, it } from 'vitest';
import { isModuleEnabled } from '@/lib/authorization';
import { getValidTransitions, validateTransition } from '@/lib/state-machine';
import { formatBusinessNumber, formatPhoneNumber, isValidKoreaCoords, validateBusinessNumber } from '@/lib/validators';

describe('workflow transitions', () => {
  it('allows the defined survey workflow', () => {
    expect(validateTransition('survey', 'draft', 'in_progress')).toBe(true);
    expect(validateTransition('survey', 'review', 'approved')).toBe(true);
  });

  it('blocks skipping survey review', () => {
    expect(validateTransition('survey', 'draft', 'approved')).toBe(false);
  });

  it('allows a closed complaint to reopen for a documented appeal or repeat complaint', () => {
    expect(getValidTransitions('complaint', 'closed')).toEqual(['reopened']);
    expect(validateTransition('complaint', 'closed', 'reopened')).toBe(true);
  });

  it('supports rejection recovery for budgets', () => {
    expect(getValidTransitions('budget_plan', 'rejected')).toEqual(['draft']);
  });

  it('allows custom entities that have no registered workflow', () => {
    expect(validateTransition('custom_entity', 'a', 'b')).toBe(true);
  });
});

describe('business validators', () => {
  it('formats mobile and landline phone numbers', () => {
    expect(formatPhoneNumber('01012345678')).toBe('010-1234-5678');
    expect(formatPhoneNumber('021234567')).toBe('02-123-4567');
  });

  it('formats a business registration number', () => {
    expect(formatBusinessNumber('1234567890')).toBe('123-45-67890');
  });

  it('validates a known checksum and rejects malformed numbers', () => {
    expect(validateBusinessNumber('220-81-62517')).toBe(true);
    expect(validateBusinessNumber('220-81-62518')).toBe(false);
    expect(validateBusinessNumber('123')).toBe(false);
  });

  it('accepts coordinates in Korea and rejects distant coordinates', () => {
    expect(isValidKoreaCoords(37.5665, 126.978)).toBe(true);
    expect(isValidKoreaCoords(35.1796, 129.0756)).toBe(true);
    expect(isValidKoreaCoords(40.7128, -74.006)).toBe(false);
  });
});

describe('module license fallback', () => {
  it('keeps legacy modules available when no license rows exist yet', () => {
    expect(isModuleEnabled(undefined, 'FACILITY')).toBe(true);
    expect(isModuleEnabled([], 'COMPLAINT')).toBe(true);
  });

  it('enforces license rows once they are configured', () => {
    expect(isModuleEnabled([{ module_code: 'FACILITY', is_active: false }], 'FACILITY')).toBe(false);
    expect(isModuleEnabled([{ module_code: 'FACILITY', is_active: true }], 'FACILITY')).toBe(true);
  });
});
