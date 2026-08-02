import { describe, expect, it } from 'vitest';
import { escapeHTML, safeJSONParse, sanitizeURLParams } from '@/lib/code-injection-guard';
import { isPathSafe, sanitizePath, sanitizeURL } from '@/lib/path-security';
import { escapeForQuery, sanitizeHTML, sanitizeInputURL, sanitizeText } from '@/lib/sanitizer';

describe('path and redirect security', () => {
  it('normalizes separators and strips traversal prefixes', () => {
    expect(sanitizePath('../uploads\\report.pdf')).toBe('uploads/report.pdf');
  });

  it('rejects parent traversal paths', () => {
    expect(isPathSafe('exports/../../secret.txt', '/exports')).toBe(false);
  });

  it('rejects absolute Windows and Unix paths', () => {
    expect(isPathSafe('C:\\Windows\\system.ini', '/exports')).toBe(false);
    expect(isPathSafe('/etc/passwd', '/exports')).toBe(false);
  });

  it('allows a normal relative path', () => {
    expect(isPathSafe('reports/2026/july.xlsx', '/exports')).toBe(true);
  });

  it('keeps same-origin redirects and rejects external origins', () => {
    expect(sanitizeURL('/lots?status=active#list')).toBe('/lots?status=active#list');
    expect(sanitizeURL('https://attacker.example/phish')).toBe('/');
  });
});

describe('input sanitization', () => {
  it('removes all HTML from plain text', () => {
    expect(sanitizeText('  <b>Hello</b><script>alert(1)</script>  ')).toBe('Hello');
  });

  it('keeps allowed rich-text tags and removes unsafe attributes', () => {
    expect(sanitizeHTML('<p onclick="evil()"><strong>Safe</strong></p>')).toBe('<p><strong>Safe</strong></p>');
  });

  it('accepts HTTP URLs and blocks script protocols', () => {
    expect(sanitizeInputURL('https://example.com/a').startsWith('https://example.com/a')).toBe(true);
    expect(sanitizeInputURL('javascript:alert(1)')).toBe('');
  });

  it('removes query-breaking punctuation', () => {
    expect(escapeForQuery(`a';\\"b`)).toBe('ab');
  });

  it('escapes markup-significant characters', () => {
    expect(escapeHTML(`<script src='/x'>`)).toBe('&lt;script src=&#x27;&#x2F;x&#x27;&gt;');
  });

  it('returns a fallback for invalid JSON', () => {
    expect(safeJSONParse('not json', { safe: true })).toEqual({ safe: true });
  });

  it('strips executable URL parameter fragments', () => {
    const result = sanitizeURLParams(new URLSearchParams('next=javascript%3Aalert(1)&name=%3Cscript%3Ebad%3C%2Fscript%3Eok'));
    expect(result).toEqual({ next: 'alert(1)', name: 'ok' });
  });
});
