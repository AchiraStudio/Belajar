import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from './config';

const dev = { production: false };
const prod = { production: true };

describe('parseConfig', () => {
  it('defaults to same-origin', () => {
    expect(parseConfig({}, prod)).toEqual({ apiBaseUrl: '' });
    expect(parseConfig({ VITE_API_BASE_URL: '   ' }, prod)).toEqual({ apiBaseUrl: '' });
  });

  it('normalises a trailing slash', () => {
    expect(parseConfig({ VITE_API_BASE_URL: 'https://api.example.com/' }, prod).apiBaseUrl).toBe(
      'https://api.example.com',
    );
    expect(
      parseConfig({ VITE_API_BASE_URL: 'https://example.com/belajar//' }, prod).apiBaseUrl,
    ).toBe('https://example.com/belajar');
  });

  it('rejects garbage, other schemes and embedded credentials', () => {
    expect(() => parseConfig({ VITE_API_BASE_URL: 'not a url' }, dev)).toThrow(ConfigError);
    expect(() => parseConfig({ VITE_API_BASE_URL: 'ftp://example.com' }, dev)).toThrow(/http/);
    expect(() => parseConfig({ VITE_API_BASE_URL: 'https://u:p@example.com' }, dev)).toThrow(
      /credentials/,
    );
  });

  it('requires https for remote hosts in production but allows local http', () => {
    expect(() => parseConfig({ VITE_API_BASE_URL: 'http://api.example.com' }, prod)).toThrow(
      /https/,
    );
    expect(parseConfig({ VITE_API_BASE_URL: 'http://127.0.0.1:8080' }, prod).apiBaseUrl).toBe(
      'http://127.0.0.1:8080',
    );
    expect(parseConfig({ VITE_API_BASE_URL: 'http://api.example.com' }, dev).apiBaseUrl).toBe(
      'http://api.example.com',
    );
  });
});
