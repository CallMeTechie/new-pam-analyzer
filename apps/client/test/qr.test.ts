import { describe, expect, it } from 'vitest';
import { parseConnectQr } from '../src/pages/Server';

describe('parseConnectQr', () => {
  it('reads the link of an invitation or connect code', () => {
    expect(parseConnectQr('https://pam.example.com/connect/7KQ4M2XP')).toEqual({
      code: '7KQ4-M2XP',
      server: 'https://pam.example.com',
    });
    expect(parseConnectQr(' https://example.com/pam/connect/7kq4m2xp/\n')).toEqual({
      code: '7KQ4-M2XP',
      server: 'https://example.com/pam',
    });
  });
  it('accepts a code alone', () => {
    expect(parseConnectQr('7kq4-m2xp')).toEqual({ code: '7KQ4-M2XP' });
    expect(parseConnectQr('7KQ4M2XP')).toEqual({ code: '7KQ4-M2XP' });
  });
  it('rejects other codes', () => {
    expect(parseConnectQr('https://example.com')).toBeNull();
    expect(parseConnectQr('ftp://example.com/connect/7KQ4M2XP')).toBeNull();
    expect(parseConnectQr(JSON.stringify({ apiKey: 'pam_abc' }))).toBeNull();
  });
});
