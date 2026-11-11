import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { mockRpc, renderWithProviders } from '../../test/e2e/harness';
import { dropCache } from '../../services/api/rpc';
import { MindMapView } from './MindMapView';

const mindmap = {
  root: {
    id: 'n0',
    label: 'Jaringan',
    children: [
      { id: 'n1', label: 'Model OSI', children: [{ id: 'n2', label: 'Transport' }, { id: 'n3', label: 'Network' }] },
      { id: 'n4', label: 'Protokol', children: [{ id: 'n5', label: 'TCP' }] },
    ],
  },
  relations: [{ from: 'n3', to: 'n5', label: 'dipakai oleh' }],
  node_count: 6,
  updated_at: 1700000000,
  stale: false,
};

describe('MindMapView', () => {
  beforeEach(() => {
    cleanup();
    dropCache();
    mockRpc.install();
    mockRpc.reset();
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    mockRpc.uninstall();
    vi.restoreAllMocks();
  });

  const view = (onFind = vi.fn()) => {
    renderWithProviders(<MindMapView documentId={101} onFindInNotes={onFind} />);
    return onFind;
  };

  it('renders the map with keyboard-operable nodes and a working outline alternative', async () => {
    mockRpc.setResponse('mindmap_get', { mindmap, job: null });
    view();

    const map = await screen.findByRole('application');
    expect(within(map).getByRole('button', { name: 'Jaringan' })).toBeTruthy();
    expect(within(map).getByRole('button', { name: 'Transport' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Daftar/ }));
    const tree = await screen.findByRole('tree');
    expect(within(tree).getByRole('button', { name: 'TCP' })).toBeTruthy();
    expect(screen.queryByRole('application')).toBeNull();
  });

  it('selecting a node shows its details, relations and a jump-to-notes action', async () => {
    mockRpc.setResponse('mindmap_get', { mindmap, job: null });
    const onFind = view();

    const map = await screen.findByRole('application');
    fireEvent.click(within(map).getByRole('button', { name: 'Network' }));

    const detail = await screen.findByRole('complementary', { name: 'Detail konsep terpilih' });
    expect(within(detail).getByText('Jaringan › Model OSI')).toBeTruthy();
    expect(within(detail).getByText(/dipakai oleh/)).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Cari di catatan' }));
    expect(onFind).toHaveBeenCalledWith('Network');
  });

  it('collapses and re-opens a branch', async () => {
    mockRpc.setResponse('mindmap_get', { mindmap, job: null });
    view();
    const map = await screen.findByRole('application');
    fireEvent.click(within(map).getByRole('button', { name: 'Ciutkan Model OSI' }));
    await waitFor(() => expect(within(screen.getByRole('application')).queryByRole('button', { name: 'Transport' })).toBeNull());
    fireEvent.click(within(screen.getByRole('application')).getByRole('button', { name: /Buka 2 sub-topik Model OSI/ }));
    await within(screen.getByRole('application')).findByRole('button', { name: 'Transport' });
  });

  it('search dims non-matching nodes and reports the match count', async () => {
    mockRpc.setResponse('mindmap_get', { mindmap, job: null });
    view();
    await screen.findByRole('application');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tcp' } });
    expect(await screen.findByText('1')).toBeTruthy();
  });

  it('warns that a stale map may be outdated instead of presenting it as current', async () => {
    mockRpc.setResponse('mindmap_get', { mindmap: { ...mindmap, stale: true }, job: null });
    view();
    expect(await screen.findByText(/Catatan berubah sejak mind map ini dibuat/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Buat ulang' })).toBeTruthy();
  });

  it('shows real progress while a generation job runs', async () => {
    mockRpc.setResponse('mindmap_get', { mindmap: null, job: { id: 9, status: 'running', progress: 40, message: 'Menyusun cabang' } });
    mockRpc.setResponse('get_job', { id: 9, status: 'running', progress: 40, message: 'Menyusun cabang' });
    view();
    expect(await screen.findByText('Menyusun mind map…')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Kemajuan pembuatan mind map' }).getAttribute('aria-valuenow')).toBe('40');
  });
});
