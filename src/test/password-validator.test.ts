import { describe, expect, it } from 'vitest';
import { validatePassword } from '@/lib/password-validator';

describe('validatePassword', () => {
  it('accepts a strong password', () => {
    const result = validatePassword('G7!vQ2#kLm');
    expect(result.isValid).toBe(true);
    expect(result.strength).toBe('strong');
    expect(result.score).toBe(100);
  });

  it('enforces a custom minimum length', () => {
    const result = validatePassword('G7!vQ2#kLm', undefined, 12);
    expect(result.checks.minLength).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it('rejects a password containing the email user id', () => {
    const result = validatePassword('Worker!9Qz', 'worker@example.com');
    expect(result.checks.noUserId).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it('rejects sequential characters even with full complexity', () => {
    const result = validatePassword('Abc!890xyZ');
    expect(result.checks.noSequential).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it('requires upper, lower, number, and special characters', () => {
    const result = validatePassword('onlyletters');
    expect(result.checks.hasUppercase).toBe(false);
    expect(result.checks.hasNumber).toBe(false);
    expect(result.checks.hasSpecial).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it('treats non-alphanumeric punctuation as a special character', () => {
    expect(validatePassword('Valid9 Korean-').checks.hasSpecial).toBe(true);
  });
});
