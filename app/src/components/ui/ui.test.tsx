import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
} from './index';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UI Primitives', () => {
  describe('Icon', () => {
    it('renders pure SVG icon with correct attributes', () => {
      const { container } = render(<Icon name="home" size={24} data-testid="home-icon" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('width')).toBe('24');
      expect(svg?.getAttribute('height')).toBe('24');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    });

    it('returns null for uncataloged icon name safely', () => {
      const { container } = render(<Icon name={'non-existent' as any} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Button', () => {
    it('renders with variants, sizes, and handles click', () => {
      const handleClick = vi.fn();
      render(
        <Button variant="primary" size="lg" onClick={handleClick}>
          Lanjutkan
        </Button>,
      );

      const btn = screen.getByRole('button', { name: 'Lanjutkan' });
      expect(btn).toBeTruthy();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('displays spinner and sets aria-busy when loading', () => {
      render(<Button loading>Menyimpan</Button>);
      const btn = screen.getByRole('button');
      expect(btn.getAttribute('aria-busy')).toBe('true');
      expect(btn.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('IconButton', () => {
    it('requires accessible label and sets title and aria-label', () => {
      const handleClick = vi.fn();
      render(
        <IconButton
          icon="settings"
          label="Buka Pengaturan"
          tooltip="Pengaturan Akun"
          onClick={handleClick}
        />,
      );

      const btn = screen.getByRole('button', { name: 'Buka Pengaturan' });
      expect(btn).toBeTruthy();
      expect(btn.getAttribute('title')).toBe('Pengaturan Akun');
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('FrostPanel & SurfaceCard', () => {
    it('FrostPanel renders with elevation classes', () => {
      const { container } = render(
        <FrostPanel elevation="overlay" data-testid="panel">
          Konten Frost
        </FrostPanel>,
      );
      expect(screen.getByText('Konten Frost')).toBeTruthy();
      expect(container.firstChild).toBeTruthy();
    });

    it('SurfaceCard renders solid surface with interactive option', () => {
      render(
        <SurfaceCard interactive padded>
          Kartu Pembelajaran
        </SurfaceCard>,
      );
      expect(screen.getByText('Kartu Pembelajaran')).toBeTruthy();
    });
  });

  describe('Input', () => {
    it('renders label, handles value change, and clearable button', () => {
      function InputConsumer() {
        const [val, setVal] = useState('awal');
        return (
          <Input
            label="Nama Materi"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            clearable
            onClear={() => setVal('')}
          />
        );
      }

      render(<InputConsumer />);
      const input = screen.getByLabelText('Nama Materi') as HTMLInputElement;
      expect(input.value).toBe('awal');

      const clearBtn = screen.getByRole('button', { name: 'Hapus teks' });
      fireEvent.click(clearBtn);
      expect(input.value).toBe('');
    });

    it('renders accessible error alert when error prop is provided', () => {
      render(<Input label="Email" error="Format email tidak valid" />);
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBe('Format email tidak valid');
      const input = screen.getByLabelText('Email');
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
  });

  describe('Select', () => {
    it('renders options and handles selection change', () => {
      const handleChange = vi.fn();
      render(
        <Select
          label="Pilih Topik"
          options={[
            { value: 'fisika', label: 'Fisika' },
            { value: 'kimia', label: 'Kimia' },
          ]}
          onChange={handleChange}
        />,
      );

      const select = screen.getByLabelText('Pilih Topik') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'kimia' } });
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('Tabs', () => {
    it('renders WAI-ARIA tablist and navigates with arrow keys', () => {
      function TabsConsumer() {
        const [tab, setTab] = useState('catatan');
        return (
          <Tabs
            items={[
              { id: 'catatan', label: 'Catatan' },
              { id: 'mindmap', label: 'Mind Map' },
              { id: 'kuis', label: 'Kuis' },
            ]}
            activeTab={tab}
            onChange={setTab}
          />
        );
      }

      render(<TabsConsumer />);
      const catatanTab = screen.getByRole('tab', { name: 'Catatan' });
      const mindmapTab = screen.getByRole('tab', { name: 'Mind Map' });

      expect(catatanTab.getAttribute('aria-selected')).toBe('true');
      expect(mindmapTab.getAttribute('aria-selected')).toBe('false');

      catatanTab.focus();
      fireEvent.keyDown(catatanTab, { key: 'ArrowRight' });

      expect(mindmapTab.getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('StatusBadge', () => {
    it('renders semantic status and Indonesian labels', () => {
      const { rerender } = render(<StatusBadge status="ready" />);
      expect(screen.getByRole('status').textContent).toBe('Siap');

      rerender(<StatusBadge status="processing" label="Sedang Mengekstrak..." />);
      expect(screen.getByRole('status').textContent).toBe('Sedang Mengekstrak...');
    });
  });

  describe('Skeleton', () => {
    it('renders loading placeholder with aria-busy', () => {
      const { container } = render(<Skeleton width={200} height={20} />);
      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton.getAttribute('aria-busy')).toBe('true');
      expect(skeleton.style.width).toBe('200px');
      expect(skeleton.style.height).toBe('20px');
    });
  });

  describe('Toast', () => {
    it('displays toast message via hook and closes on demand', () => {
      function ToastTrigger() {
        const toast = useToast();
        return (
          <button type="button" onClick={() => toast.success('Materi berhasil disimpan')}>
            Simpan
          </button>
        );
      }

      render(
        <ToastProvider>
          <ToastTrigger />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
      expect(screen.getByText('Materi berhasil disimpan')).toBeTruthy();

      const closeBtn = screen.getByRole('button', { name: 'Tutup pemberitahuan' });
      fireEvent.click(closeBtn);
      expect(screen.queryByText('Materi berhasil disimpan')).toBeNull();
    });
  });

  describe('EmptyState', () => {
    it('renders honest empty illustration, message, and CTA', () => {
      const handleAction = vi.fn();
      render(
        <EmptyState
          icon="book"
          title="Belum Ada Materi"
          description="Impor dokumen pertama kamu untuk mulai belajar."
          actionLabel="Unggah Materi"
          onAction={handleAction}
        />,
      );

      expect(screen.getByText('Belum Ada Materi')).toBeTruthy();
      expect(
        screen.getByText('Impor dokumen pertama kamu untuk mulai belajar.'),
      ).toBeTruthy();

      const btn = screen.getByRole('button', { name: 'Unggah Materi' });
      fireEvent.click(btn);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('ErrorState', () => {
    it('renders alert landmark with retry button and offline support', () => {
      const handleRetry = vi.fn();
      render(
        <ErrorState
          title="Gagal Memuat Kuis"
          message="Server tidak dapat dihubungi."
          isOffline={true}
          onRetry={handleRetry}
        />,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeTruthy();
      expect(screen.getByText('Gagal Memuat Kuis')).toBeTruthy();
      expect(screen.getByText('Server tidak dapat dihubungi.')).toBeTruthy();
      expect(screen.getByText('Koneksi terputus. Bekerja secara luring.')).toBeTruthy();

      const retryBtn = screen.getByRole('button', { name: 'Coba Lagi' });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });
});
