import { describe, expect, test } from 'vitest';
import { base64UrlToUint8Array } from './base64';

describe('base64UrlToUint8Array', () => {
  test('decodes URL-safe base64 values', () => {
    expect(Array.from(base64UrlToUint8Array('SGVsbG8td29ybGQ'))).toEqual(Array.from(new TextEncoder().encode('Hello-world')));
  });
});
