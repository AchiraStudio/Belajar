// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { unstubTauri, stubMatchMedia, stubLocalStorage, stubTauri } from './browserStubs';

describe('Defect 3 SSR/Node Guard: browserStubs in Node environment (typeof window === "undefined")', () => {
  it('empirically verifies unstubTauri does not throw ReferenceError when window is undefined', () => {
    expect(typeof window).toBe('undefined');
    expect(() => {
      unstubTauri();
    }).not.toThrow();
  });

  it('empirically verifies stubTauri, stubMatchMedia, stubLocalStorage handle undefined window defensively', () => {
    expect(typeof window).toBe('undefined');
    expect(() => {
      const tauri = stubTauri();
      tauri.unstub();
    }).not.toThrow();

    expect(() => {
      const mm = stubMatchMedia();
      mm.restore();
    }).not.toThrow();

    expect(() => {
      const ls = stubLocalStorage();
      ls.restore();
    }).not.toThrow();
  });
});
