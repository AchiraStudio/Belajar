import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoHide } from './useAutoHide';

function scrollEvent(el: Element) {
  act(() => {
    el.dispatchEvent(new Event('scroll', { bubbles: false }));
  });
}

describe('useAutoHide', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const hide = () => act(() => void vi.advanceTimersByTime(4000));

  it('hides after a quiet spell', () => {
    const { result } = renderHook(() => useAutoHide());
    expect(result.current.hidden).toBe(false);
    hide();
    expect(result.current.hidden).toBe(true);
  });

  it('comes back when the page scrolls up or down', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const { result } = renderHook(() => useAutoHide());
    hide();
    panel.scrollTop = 120;
    scrollEvent(panel);
    expect(result.current.hidden).toBe(false);
    panel.remove();
  });

  it('stays hidden while a banner slides sideways by itself', () => {
    const track = document.createElement('div');
    document.body.appendChild(track);
    const { result } = renderHook(() => useAutoHide());
    hide();
    expect(result.current.hidden).toBe(true);

    // The auto-playing banner scrolls its track horizontally: many scroll events, no vertical move.
    for (let x = 0; x <= 300; x += 50) {
      track.scrollLeft = x;
      scrollEvent(track);
    }
    expect(result.current.hidden).toBe(true);
    track.remove();
  });
});
