import { describe, expect, it } from 'vitest';
import { parseKeyQr } from '../src/pages/Server';

describe('parseKeyQr', () => {
  const key = 'pam_Hk4W2c9TabcdefghijklmnopqrstuvwxyzABCDEFG';
  it('reads the QR code of the web: server and key', () => {
    expect(parseKeyQr(JSON.stringify({ server: 'https://pam.example.com', apiKey: key }))).toEqual({
      apiKey: key,
      server: 'https://pam.example.com',
    });
  });
  it('accepts the key alone', () => {
    expect(parseKeyQr(` ${key}\n`)).toEqual({ apiKey: key });
  });
  it('rejects other codes', () => {
    expect(parseKeyQr('https://example.com')).toBeNull();
    expect(parseKeyQr(JSON.stringify({ apiKey: 'nope' }))).toBeNull();
  });
});
