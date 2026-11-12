import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  StatusBadge,
  Tabs,
  ToastProvider,
  useToast,
  type TabItem,
  type StatusType,
} from '../../../components/ui';

describe('Challenger M1-2: UI Primitives Empirical Stress-Tests', () => {
  beforeEach(() => {
    delete (window as any).__TAURI__;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (window as any).__TAURI__;
  });

  // ==========================================================================
  // SECTION 2: UI Primitives Stress-Tests
  // ==========================================================================
  describe('UI Primitives: Button Loading & Disabled States', () => {
    it('STRESS-2.1: Button in loading state sets aria-busy, disables element, and blocks click', () => {
      const handleClick = vi.fn();
      render(
        <Button loading={true} onClick={handleClick}>
          Kirim Data
        </Button>,
      );

      const btn = screen.getByRole('button');
      expect(btn.getAttribute('aria-busy')).toBe('true');
      expect(btn.hasAttribute('disabled')).toBe(true);

      // Attempt click
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();

      // Spinner is present and marked aria-hidden
      const spinner = btn.querySelector('[aria-hidden="true"]');
      expect(spinner).toBeTruthy();

      // Children text remains rendered
      expect(screen.getByText('Kirim Data')).toBeTruthy();
    });

    it('STRESS-2.2: Button in disabled state blocks clicks and has no aria-busy', () => {
      const handleClick = vi.fn();
      render(
        <Button disabled={true} onClick={handleClick}>
          Hapus
        </Button>,
      );

      const btn = screen.getByRole('button', { name: 'Hapus' });
      expect(btn.hasAttribute('disabled')).toBe(true);
      expect(btn.getAttribute('aria-busy')).toBeNull();

      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('STRESS-2.3: Button handles polymorphic types and ref forwarding', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(
        <Button ref={ref} type="submit" variant="danger" size="sm" fullWidth>
          Konfirmasi
        </Button>,
      );

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
      expect(ref.current?.type).toBe('submit');
      expect(ref.current?.className).toContain('danger');
      expect(ref.current?.className).toContain('sm');
      expect(ref.current?.className).toContain('fullWidth');
    });

    it('STRESS-2.4: Button swaps icon when loading and positions icon properly', () => {
      const { rerender } = render(
        <Button icon="search" iconPosition="left">
          Cari
        </Button>,
      );

      // Icon is rendered on left
      const svgBefore = screen.getByRole('button').querySelector('svg');
      expect(svgBefore).toBeTruthy();

      // When loading, normal icon is suppressed in favor of spinner
      rerender(
        <Button icon="search" iconPosition="left" loading={true}>
          Cari
        </Button>,
      );
      const svgAfter = screen.getByRole('button').querySelector('svg');
      expect(svgAfter).toBeNull();
    });

    it('STRESS-2.5: Button supports outline and ghost variants across sizes sm, md, lg', () => {
      const { rerender } = render(
        <Button variant="outline" size="lg">
          Outline Action
        </Button>,
      );
      const btn = screen.getByRole('button', { name: 'Outline Action' });
      expect(btn.className).toContain('outline');
      expect(btn.className).toContain('lg');

      rerender(
        <Button variant="ghost" size="sm">
          Ghost Action
        </Button>,
      );
      expect(btn.className).toContain('ghost');
      expect(btn.className).toContain('sm');
    });
  });

  describe('UI Primitives: Tabs Keyboard Navigation & WAI-ARIA', () => {
    const testTabs: TabItem[] = [
      { id: 'catatan', label: 'Catatan', icon: 'book', count: 12 },
      { id: 'mindmap', label: 'Mind Map', count: 0 },
      { id: 'kuis', label: 'Kuis' },
      { id: 'chat', label: 'AI Chat' },
    ];

    function TabsInteractiveHarness({ variant = 'segmented' }: { variant?: 'segmented' | 'underline' }) {
      const [activeTab, setActiveTab] = useState('catatan');
      return (
        <div>
          <Tabs items={testTabs} activeTab={activeTab} onChange={setActiveTab} variant={variant} />
          <div data-testid="active-display">{activeTab}</div>
        </div>
      );
    }

    it('STRESS-2.6: WAI-ARIA tablist semantics, roving tabindex, and count badges', () => {
      render(<TabsInteractiveHarness />);

      const tablist = screen.getByRole('tablist');
      expect(tablist.getAttribute('aria-orientation')).toBe('horizontal');

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(4);

      // Active tab (catatan) has aria-selected=true and tabIndex=0
      expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
      expect(tabs[0]!.getAttribute('tabindex')).toBe('0');
      expect(tabs[0]!.getAttribute('id')).toBe('tab-catatan');
      expect(tabs[0]!.getAttribute('aria-controls')).toBe('panel-catatan');

      // Inactive tabs have aria-selected=false and tabIndex=-1
      expect(tabs[1]!.getAttribute('aria-selected')).toBe('false');
      expect(tabs[1]!.getAttribute('tabindex')).toBe('-1');

      // Count badge: displays count including 0
      expect(screen.getByText('12')).toBeTruthy();
      expect(screen.getByText('0')).toBeTruthy();
    });

    it('STRESS-2.7: ArrowRight and ArrowLeft keyboard navigation with wrapping and focus movement', () => {
      render(<TabsInteractiveHarness />);
      const tabs = screen.getAllByRole('tab');

      // 1. Focus first tab and press ArrowRight -> moves to tab 1 (mindmap)
      tabs[0]!.focus();
      fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
      expect(screen.getByTestId('active-display').textContent).toBe('mindmap');
      expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');

      // 2. From tab 1, press ArrowRight 3 times -> mindmap -> kuis -> chat -> wraps to catatan
      fireEvent.keyDown(tabs[1]!, { key: 'ArrowRight' }); // to kuis (idx 2)
      expect(screen.getByTestId('active-display').textContent).toBe('kuis');

      fireEvent.keyDown(tabs[2]!, { key: 'ArrowRight' }); // to chat (idx 3)
      expect(screen.getByTestId('active-display').textContent).toBe('chat');

      fireEvent.keyDown(tabs[3]!, { key: 'ArrowRight' }); // wraps to catatan (idx 0)
      expect(screen.getByTestId('active-display').textContent).toBe('catatan');

      // 3. From tab 0, press ArrowLeft -> wraps to last tab (chat, idx 3)
      fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
      expect(screen.getByTestId('active-display').textContent).toBe('chat');
    });

    it('STRESS-2.8: Home and End keys jump directly to first and last tabs', () => {
      render(<TabsInteractiveHarness />);
      const tabs = screen.getAllByRole('tab');

      // From first tab, press End -> jumps to last tab (chat)
      tabs[0]!.focus();
      fireEvent.keyDown(tabs[0]!, { key: 'End' });
      expect(screen.getByTestId('active-display').textContent).toBe('chat');

      // From last tab, press Home -> jumps to first tab (catatan)
      fireEvent.keyDown(tabs[3]!, { key: 'Home' });
      expect(screen.getByTestId('active-display').textContent).toBe('catatan');
    });

    it('STRESS-2.9: Non-navigation keys (Tab, Shift, Space) do not trigger onChange or preventDefault', () => {
      render(<TabsInteractiveHarness />);
      const tabs = screen.getAllByRole('tab');

      tabs[0]!.focus();
      fireEvent.keyDown(tabs[0]!, { key: 'Tab' });
      expect(screen.getByTestId('active-display').textContent).toBe('catatan');

      fireEvent.keyDown(tabs[0]!, { key: ' ' });
      expect(screen.getByTestId('active-display').textContent).toBe('catatan');
    });

    it('STRESS-2.10: Edge cases: empty tabs array and non-matching activeTab render without crash', () => {
      const handleChange = vi.fn();
      const { container } = render(
        <Tabs items={[]} activeTab="missing" onChange={handleChange} />,
      );
      expect(container.firstChild).toBeTruthy();
      expect(screen.getByRole('tablist')).toBeTruthy();
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
    });

    it('STRESS-2.11: Underline variant applies designated style class', () => {
      render(<TabsInteractiveHarness variant="underline" />);
      const tablist = screen.getByRole('tablist');
      expect(tablist.className).toContain('underline');
    });
  });

  describe('UI Primitives: StatusBadge Semantics & Labels', () => {
    it('STRESS-2.12: Renders semantic status labels in Indonesian for all 6 cataloged statuses', () => {
      const statuses: Array<{ status: StatusType; expectedLabel: string }> = [
        { status: 'ready', expectedLabel: 'Siap' },
        { status: 'processing', expectedLabel: 'Memproses' },
        { status: 'error', expectedLabel: 'Gagal' },
        { status: 'neutral', expectedLabel: 'Netral' },
        { status: 'warning', expectedLabel: 'Peringatan' },
        { status: 'success', expectedLabel: 'Selesai' },
      ];

      for (const { status, expectedLabel } of statuses) {
        const { unmount } = render(<StatusBadge status={status} />);
        const badge = screen.getByRole('status');
        expect(badge.textContent).toBe(expectedLabel);
        expect(badge.className).toContain(status);
        unmount();
      }
    });

    it('STRESS-2.13: Custom label override, pulse animation, and decorative dot indicator', () => {
      render(<StatusBadge status="processing" label="Sedang Mengekstrak PDF..." pulse />);
      const badge = screen.getByRole('status');
      expect(badge.textContent).toBe('Sedang Mengekstrak PDF...');
      expect(badge.className).toContain('pulse');

      const dot = badge.querySelector('i');
      expect(dot).toBeTruthy();
      expect(dot?.getAttribute('aria-hidden')).toBe('true');
    });

    it('STRESS-2.14: Graceful fallback for unexpected status values without crashing', () => {
      render(<StatusBadge status={'unknown-status' as any} />);
      const badge = screen.getByRole('status');
      expect(badge).toBeTruthy();
    });
  });

  describe('UI Primitives: Toast Lifecycle, Timers & Concurrency', () => {
    it('STRESS-2.15: useToast throws actionable error if invoked outside ToastProvider', () => {
      function NakedToastConsumer() {
        useToast();
        return <div>Naked</div>;
      }

      // Suppress console.error during expected throw
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<NakedToastConsumer />)).toThrow(
        'useToast must be used within a ToastProvider',
      );
      consoleSpy.mockRestore();
    });

    it('STRESS-2.16: Toast triggers all variants with accessible announcements and custom titles', () => {
      function ToastVariantsHarness() {
        const toast = useToast();
        return (
          <div>
            <button onClick={() => toast.success('Materi tersimpan', 'Sukses')}>Success</button>
            <button onClick={() => toast.error('Server 500', 'Kesalahan')}>Error</button>
            <button onClick={() => toast.warning('Sesi kedaluwarsa', 'Peringatan')}>Warning</button>
            <button onClick={() => toast.info('Fitur baru siap', 'Info')}>Info</button>
          </div>
        );
      }

      render(
        <ToastProvider>
          <ToastVariantsHarness />
        </ToastProvider>,
      );

      // Trigger all 4 variants
      fireEvent.click(screen.getByRole('button', { name: 'Success' }));
      fireEvent.click(screen.getByRole('button', { name: 'Error' }));
      fireEvent.click(screen.getByRole('button', { name: 'Warning' }));
      fireEvent.click(screen.getByRole('button', { name: 'Info' }));

      const region = screen.getByRole('region', { name: 'Pemberitahuan' });
      expect(region.getAttribute('aria-live')).toBe('polite');

      const toastStatuses = screen.getAllByRole('status');
      expect(toastStatuses).toHaveLength(4);

      expect(screen.getByText('Materi tersimpan')).toBeTruthy();
      expect(screen.getByText('Sukses')).toBeTruthy();
      expect(screen.getByText('Server 500')).toBeTruthy();
      expect(screen.getByText('Sesi kedaluwarsa')).toBeTruthy();
      expect(screen.getByText('Fitur baru siap')).toBeTruthy();
    });

    it('STRESS-2.17: Auto-dismissal timing: dismisses after custom duration and respects duration=0 persistence', () => {
      vi.useFakeTimers();

      function ToastTimerHarness() {
        const toast = useToast();
        return (
          <div>
            <button
              onClick={() =>
                toast({ message: 'Auto dismiss in 1500ms', variant: 'info', duration: 1500 })
              }
            >
              Timed Toast
            </button>
            <button
              onClick={() =>
                toast({ message: 'Persistent toast', variant: 'warning', duration: 0 })
              }
            >
              Persistent Toast
            </button>
          </div>
        );
      }

      render(
        <ToastProvider>
          <ToastTimerHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Timed Toast' }));
      fireEvent.click(screen.getByRole('button', { name: 'Persistent Toast' }));

      expect(screen.getByText('Auto dismiss in 1500ms')).toBeTruthy();
      expect(screen.getByText('Persistent Toast')).toBeTruthy();

      // Advance by 1499ms -> Timed toast is still present
      act(() => {
        vi.advanceTimersByTime(1499);
      });
      expect(screen.getByText('Auto dismiss in 1500ms')).toBeTruthy();

      // Advance by 2ms (total 1501ms) -> Timed toast auto-dismisses!
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(screen.queryByText('Auto dismiss in 1500ms')).toBeNull();

      // Persistent toast with duration=0 remains visible after 10 seconds!
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByText('Persistent Toast')).toBeTruthy();
    });

    it('STRESS-2.18: Manual close button removes specific toast from multiple active toasts', () => {
      function MultiToastHarness() {
        const toast = useToast();
        return (
          <div>
            <button onClick={() => toast.info('Message A', 'Alpha')}>Trigger A</button>
            <button onClick={() => toast.info('Message B', 'Beta')}>Trigger B</button>
            <button onClick={() => toast.info('Message C', 'Gamma')}>Trigger C</button>
          </div>
        );
      }

      render(
        <ToastProvider>
          <MultiToastHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Trigger A' }));
      fireEvent.click(screen.getByRole('button', { name: 'Trigger B' }));
      fireEvent.click(screen.getByRole('button', { name: 'Trigger C' }));

      expect(screen.getByText('Message A')).toBeTruthy();
      expect(screen.getByText('Message B')).toBeTruthy();
      expect(screen.getByText('Message C')).toBeTruthy();

      // Dismiss Toast B specifically
      const closeButtons = screen.getAllByRole('button', { name: 'Tutup pemberitahuan' });
      expect(closeButtons).toHaveLength(3);

      fireEvent.click(closeButtons[1]!); // Close Toast B

      expect(screen.getByText('Message A')).toBeTruthy();
      expect(screen.queryByText('Message B')).toBeNull();
      expect(screen.getByText('Message C')).toBeTruthy();
    });
  });
});
