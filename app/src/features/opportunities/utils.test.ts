import { describe, expect, it } from 'vitest';
import { deadlineState, safeUrl } from './utils';

const NOW = 1_800_000_000;
const DAY = 86_400;

describe('deadlineState', () => {
  it('marks past deadlines as closed', () => {
    expect(deadlineState(NOW - 10, NOW).kind).toBe('closed');
    expect(deadlineState(NOW, NOW).kind).toBe('closed');
  });
  it('marks deadlines within 14 days as closing soon, with an exact day count', () => {
    const s = deadlineState(NOW + 3 * DAY - 100, NOW);
    expect(s.kind).toBe('soon');
    expect(s.label).toBe('Ditutup 3 hari lagi');
    expect(deadlineState(NOW + 5, NOW).label).toBe('Ditutup besok');
    expect(deadlineState(NOW + 14 * DAY, NOW).kind).toBe('soon');
  });
  it('marks later deadlines as open', () => {
    expect(deadlineState(NOW + 15 * DAY, NOW).kind).toBe('open');
  });
});

describe('safeUrl', () => {
  it('only allows http(s) links', () => {
    expect(safeUrl('https://example.org/a')).toBe('https://example.org/a');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<b>')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});
