import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseOption } from './select';
import {
  Button,
  EmptyState,
  ErrorState,
  FrostPanel,
  Icon,
  IconButton,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  SurfaceCard,
  Tabs,
  ToastProvider,
  useToast,
  type TabItem,
  type StatusType,
} from '../../../components/ui';

describe('Challenger M1 R2.2: Adversarial Empirical Challenge Suite', () => {
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
  // SECTION 3: UI PRIMITIVES BOUNDARY STATES
  // ==========================================================================
  describe('3. UI Primitives Boundary States & Edge Behaviors', () => {
    // 3.1 Button Edge States
    describe('3.1 Button', () => {
      it('blocks clicks and sets aria-busy when loading=true', () => {
        const handleClick = vi.fn();
        render(
          <Button loading={true} onClick={handleClick}>
            Simpan Perubahan
          </Button>,
        );

        const btn = screen.getByRole('button');
        expect(btn.getAttribute('aria-busy')).toBe('true');
        expect(btn.hasAttribute('disabled')).toBe(true);

        fireEvent.click(btn);
        expect(handleClick).not.toHaveBeenCalled();
      });

      it('blocks clicks and does not set aria-busy when disabled=true', () => {
        const handleClick = vi.fn();
        render(
          <Button disabled={true} onClick={handleClick}>
            Batal
          </Button>,
        );

        const btn = screen.getByRole('button', { name: 'Batal' });
        expect(btn.hasAttribute('disabled')).toBe(true);
        expect(btn.getAttribute('aria-busy')).toBeNull();

        fireEvent.click(btn);
        expect(handleClick).not.toHaveBeenCalled();
      });

      it('forwards ref properly to HTMLButtonElement', () => {
        const ref = React.createRef<HTMLButtonElement>();
        render(<Button ref={ref}>Test Ref</Button>);
        expect(ref.current).toBeInstanceOf(HTMLButtonElement);
      });
    });

    // 3.2 IconButton Edge States
    describe('3.2 IconButton', () => {
      it('has default type="button" to prevent accidental form submission', () => {
        render(<IconButton icon="settings" label="Pengaturan" />);
        const btn = screen.getByRole('button', { name: 'Pengaturan' });
        expect(btn.getAttribute('type')).toBe('button');
      });

      it('falls back to label when tooltip is omitted', () => {
        render(<IconButton icon="search" label="Cari Materi" />);
        const btn = screen.getByRole('button', { name: 'Cari Materi' });
        expect(btn.getAttribute('title')).toBe('Cari Materi');
      });

      it('respects custom tooltip over label for title attribute', () => {
        render(
          <IconButton icon="search" label="Cari Materi" tooltip="Klik untuk mencari berkas" />,
        );
        const btn = screen.getByRole('button', { name: 'Cari Materi' });
        expect(btn.getAttribute('title')).toBe('Klik untuk mencari berkas');
      });

      it('blocks clicks when disabled', () => {
        const handleClick = vi.fn();
        render(<IconButton icon="trash" label="Hapus" disabled={true} onClick={handleClick} />);
        const btn = screen.getByRole('button', { name: 'Hapus' });
        expect(btn.hasAttribute('disabled')).toBe(true);

        fireEvent.click(btn);
        expect(handleClick).not.toHaveBeenCalled();
      });
    });

    // 3.3 Input Boundary States
    describe('3.3 Input', () => {
      it('handles numeric zero value: displays "0" and shows clear button if clearable', () => {
        const handleClear = vi.fn();
        render(
          <Input
            label="Jumlah Soal"
            value={0}
            clearable={true}
            onClear={handleClear}
            onChange={() => {}}
          />,
        );

        const input = screen.getByLabelText('Jumlah Soal') as HTMLInputElement;
        expect(input.value).toBe('0');

        // Clear button should be visible because 0 is a valid value
        const clearBtn = screen.getByRole('button', { name: 'Hapus teks' });
        expect(clearBtn).toBeTruthy();

        fireEvent.click(clearBtn);
        expect(handleClear).toHaveBeenCalledTimes(1);
      });

      it('does NOT show clear button when value is empty string or disabled', () => {
        const { rerender } = render(
          <Input label="Nama" value="" clearable={true} onChange={() => {}} />,
        );
        expect(screen.queryByRole('button', { name: 'Hapus teks' })).toBeNull();

        rerender(
          <Input label="Nama" value="Ada Teks" clearable={true} disabled={true} onChange={() => {}} />,
        );
        expect(screen.queryByRole('button', { name: 'Hapus teks' })).toBeNull();
      });

      it('associates error state with aria-invalid="true" and role="alert"', () => {
        render(
          <Input
            label="Email"
            error="Format email tidak valid."
            value="invalid-email"
            onChange={() => {}}
          />,
        );

        const input = screen.getByLabelText('Email');
        expect(input.getAttribute('aria-invalid')).toBe('true');

        const alert = screen.getByRole('alert');
        expect(alert.textContent).toBe('Format email tidak valid.');
        expect(input.getAttribute('aria-describedby')).toBe(alert.id);
      });

      it('renders multiline mode as textarea with specified rows', () => {
        render(
          <Input
            label="Catatan Pembelajaran"
            multiline={true}
            rows={5}
            value="Catatan panjang..."
            onChange={() => {}}
          />,
        );

        const textarea = screen.getByLabelText('Catatan Pembelajaran') as HTMLTextAreaElement;
        expect(textarea.tagName.toLowerCase()).toBe('textarea');
        expect(textarea.rows).toBe(5);
      });
    });

    // 3.4 Select Boundary States
    describe('3.4 Select', () => {
      it('renders options array and handles change', () => {
        const handleChange = vi.fn();
        const options = [
          { value: 'opt1', label: 'Opsi 1' },
          { value: 'opt2', label: 'Opsi 2' },
        ];

        render(
          <Select label="Pilih Topik" options={options} onChange={handleChange} defaultValue="opt1" />,
        );

        const select = screen.getByRole('combobox', { name: 'Pilih Topik' });
        expect(select.textContent).toContain('Opsi 1');

        chooseOption(select, 'Opsi 2');
        expect(handleChange).toHaveBeenCalledTimes(1);
        expect(select.textContent).toContain('Opsi 2');
      });

      it('reflects error state with aria-invalid="true" and role="alert"', () => {
        render(
          <Select
            label="Pilih Kategori"
            error="Kategori wajib dipilih."
            options={[{ value: '', label: '-- Pilih --' }]}
          />,
        );

        const select = screen.getByLabelText('Pilih Kategori');
        expect(select.getAttribute('aria-invalid')).toBe('true');

        const alert = screen.getByRole('alert');
        expect(alert.textContent).toBe('Kategori wajib dipilih.');
      });
    });

    // 3.5 Tabs Boundary States & WAI-ARIA Keyboard Roving
    describe('3.5 Tabs', () => {
      const items: TabItem[] = [
        { id: 't1', label: 'Tab 1', count: 0 },
        { id: 't2', label: 'Tab 2', count: 5 },
        { id: 't3', label: 'Tab 3' },
      ];

      it('manages roving tabindex and count badges including count=0', () => {
        const handleChange = vi.fn();
        render(<Tabs items={items} activeTab="t1" onChange={handleChange} />);

        const tabs = screen.getAllByRole('tab');
        expect(tabs).toHaveLength(3);

        // Active tab has tabindex 0, others -1
        expect(tabs[0]?.getAttribute('tabindex')).toBe('0');
        expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
        expect(tabs[1]?.getAttribute('tabindex')).toBe('-1');
        expect(tabs[2]?.getAttribute('tabindex')).toBe('-1');

        // Count=0 is rendered honestly
        expect(screen.getByText('0')).toBeTruthy();
        expect(screen.getByText('5')).toBeTruthy();
      });

      it('keyboard navigation: ArrowRight wraps from last tab to first tab', () => {
        const handleChange = vi.fn();
        render(<Tabs items={items} activeTab="t3" onChange={handleChange} />);

        const tabs = screen.getAllByRole('tab');
        tabs[2]?.focus();

        fireEvent.keyDown(tabs[2]!, { key: 'ArrowRight' });
        expect(handleChange).toHaveBeenCalledWith('t1');
      });

      it('keyboard navigation: ArrowLeft wraps from first tab to last tab', () => {
        const handleChange = vi.fn();
        render(<Tabs items={items} activeTab="t1" onChange={handleChange} />);

        const tabs = screen.getAllByRole('tab');
        tabs[0]?.focus();

        fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
        expect(handleChange).toHaveBeenCalledWith('t3');
      });

      it('keyboard navigation: Home and End keys jump to first and last tabs', () => {
        const handleChange = vi.fn();
        render(<Tabs items={items} activeTab="t2" onChange={handleChange} />);

        const tabs = screen.getAllByRole('tab');
        tabs[1]?.focus();

        fireEvent.keyDown(tabs[1]!, { key: 'Home' });
        expect(handleChange).toHaveBeenCalledWith('t1');

        fireEvent.keyDown(tabs[1]!, { key: 'End' });
        expect(handleChange).toHaveBeenCalledWith('t3');
      });

      it('handles empty items array gracefully without crash', () => {
        const { container } = render(<Tabs items={[]} activeTab="none" onChange={() => {}} />);
        expect(container.firstChild).toBeTruthy();
        expect(screen.queryAllByRole('tab')).toHaveLength(0);
      });
    });

    // 3.6 StatusBadge Semantics
    describe('3.6 StatusBadge', () => {
      it('maps all 6 semantic statuses to authentic Indonesian terms', () => {
        const mappings: Array<{ status: StatusType; label: string }> = [
          { status: 'ready', label: 'Siap' },
          { status: 'processing', label: 'Memproses' },
          { status: 'error', label: 'Gagal' },
          { status: 'neutral', label: 'Netral' },
          { status: 'warning', label: 'Peringatan' },
          { status: 'success', label: 'Selesai' },
        ];

        for (const { status, label } of mappings) {
          const { unmount } = render(<StatusBadge status={status} />);
          const badge = screen.getByRole('status');
          expect(badge.textContent).toBe(label);
          expect(badge.className).toContain(status);
          unmount();
        }
      });

      it('supports custom label override and pulse indicator', () => {
        render(<StatusBadge status="processing" label="Mengonversi Audio..." pulse={true} />);
        const badge = screen.getByRole('status');
        expect(badge.textContent).toBe('Mengonversi Audio...');
        expect(badge.className).toContain('pulse');
      });
    });

    // 3.7 Toast Provider & Hook Lifecycles
    describe('3.7 Toast', () => {
      it('throws an informative error when useToast is called outside ToastProvider', () => {
        function NakedComponent() {
          useToast();
          return null;
        }

        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<NakedComponent />)).toThrow(
          'useToast must be used within a ToastProvider',
        );
        spy.mockRestore();
      });

      it('supports persistent toast with duration=0', () => {
        vi.useFakeTimers();

        function ToastHarness() {
          const toast = useToast();
          return (
            <button onClick={() => toast({ message: 'Pemberitahuan penting', variant: 'warning', duration: 0 })}>
              Picu Toast
            </button>
          );
        }

        render(
          <ToastProvider>
            <ToastHarness />
          </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Picu Toast' }));
        expect(screen.getByText('Pemberitahuan penting')).toBeTruthy();

        // Advance timers by 10 minutes
        act(() => {
          vi.advanceTimersByTime(600_000);
        });

        // Still present!
        expect(screen.getByText('Pemberitahuan penting')).toBeTruthy();
      });

      it('auto-dismisses timed toast after custom duration', () => {
        vi.useFakeTimers();

        function ToastHarness() {
          const toast = useToast();
          return (
            <button onClick={() => toast({ message: 'Pemberitahuan sementara', variant: 'info', duration: 2000 })}>
              Picu Toast
            </button>
          );
        }

        render(
          <ToastProvider>
            <ToastHarness />
          </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Picu Toast' }));
        expect(screen.getByText('Pemberitahuan sementara')).toBeTruthy();

        act(() => {
          vi.advanceTimersByTime(1999);
        });
        expect(screen.getByText('Pemberitahuan sementara')).toBeTruthy();

        act(() => {
          vi.advanceTimersByTime(2);
        });
        expect(screen.queryByText('Pemberitahuan sementara')).toBeNull();
      });
    });

    // 3.8 EmptyState & ErrorState Honest UI
    describe('3.8 EmptyState & ErrorState', () => {
      it('EmptyState renders title, description, and action button if both label and onAction provided', () => {
        const handleAction = vi.fn();
        render(
          <EmptyState
            title="Belum Ada Materi"
            description="Unggah materi pembelajaran pertama Anda."
            actionLabel="Unggah Sekarang"
            onAction={handleAction}
          />,
        );

        expect(screen.getByText('Belum Ada Materi')).toBeTruthy();
        expect(screen.getByText('Unggah materi pembelajaran pertama Anda.')).toBeTruthy();

        const btn = screen.getByRole('button', { name: 'Unggah Sekarang' });
        fireEvent.click(btn);
        expect(handleAction).toHaveBeenCalledTimes(1);
      });

      it('EmptyState does not render action button if onAction is missing', () => {
        render(<EmptyState title="Kosong" actionLabel="Aksi" />);
        expect(screen.queryByRole('button')).toBeNull();
      });

      it('ErrorState renders role="alert", error message, and retry button', () => {
        const handleRetry = vi.fn();
        render(
          <ErrorState
            title="Gagal Memuat Kuis"
            message="Koneksi terputus saat mengambil soal."
            onRetry={handleRetry}
            retryLabel="Coba Lagi"
          />,
        );

        const alert = screen.getByRole('alert');
        expect(alert).toBeTruthy();
        expect(screen.getByText('Gagal Memuat Kuis')).toBeTruthy();
        expect(screen.getByText('Koneksi terputus saat mengambil soal.')).toBeTruthy();

        const retryBtn = screen.getByRole('button', { name: 'Coba Lagi' });
        fireEvent.click(retryBtn);
        expect(handleRetry).toHaveBeenCalledTimes(1);
      });

      it('ErrorState shows offline banner when isOffline=true', () => {
        render(
          <ErrorState message="Server offline" isOffline={true} />,
        );
        expect(screen.getByText('Koneksi terputus. Bekerja secara luring.')).toBeTruthy();
      });
    });

    // 3.9 FrostPanel, SurfaceCard, and Skeleton
    describe('3.9 FrostPanel, SurfaceCard & Skeleton', () => {
      it('FrostPanel forwards ref and applies elevation classes', () => {
        const ref = React.createRef<HTMLDivElement>();
        render(
          <FrostPanel ref={ref} elevation="raised">
            Isi Panel
          </FrostPanel>,
        );
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
        expect(ref.current?.className).toContain('raised');
      });

      it('SurfaceCard applies interactive and selected classes', () => {
        render(
          <SurfaceCard interactive={true} selected={true}>
            Kartu Aktif
          </SurfaceCard>,
        );
        const card = screen.getByText('Kartu Aktif');
        expect(card.className).toContain('interactive');
        expect(card.className).toContain('selected');
      });

      it('Skeleton sets aria-busy="true" and aria-hidden="true", and supports circle mode', () => {
        const { container } = render(<Skeleton circle={true} width={40} />);
        const el = container.firstChild as HTMLElement;
        expect(el.getAttribute('aria-busy')).toBe('true');
        expect(el.getAttribute('aria-hidden')).toBe('true');
        expect(el.className).toContain('circle');
        expect(el.style.borderRadius).toBe('50%');
      });
    });
  });
});
