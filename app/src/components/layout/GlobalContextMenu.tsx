import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { copyText } from '../../services/files';
import { useI18n } from '../../services/i18n';
import { useTheme } from '../../services/theme/ThemeContext';
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu';

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Input types that hold text the user can cut, copy and paste. */
const TEXT_INPUT = /^(text|search|email|url|tel|password|number|)$/i;

function textField(el: Element | null): TextField | null {
  const field = el?.closest('input, textarea') as TextField | null;
  if (!field) return null;
  if (field instanceof HTMLInputElement && !TEXT_INPUT.test(field.type)) return null;
  return field;
}

/** React only notices a change made from outside if an `input` event follows it. */
function announce(field: TextField) {
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

interface Opened {
  x: number;
  y: number;
  entries: MenuEntry[];
}

/**
 * The right-click menu of the desktop app, replacing the browser's (which carries "Inspect", "Save
 * as" and other things that do not belong in an app). What it offers depends on what was clicked:
 * cut / copy / paste in a text field, copy for selected text, open / copy for a link, then the
 * everyday app actions. A phone has no right click (a long press is the hold menu), so it is off
 * there, and any element can opt out with `data-native-contextmenu`.
 */
export function GlobalContextMenu({ onSearch }: { onSearch: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleTheme } = useTheme();
  const mouse = useMediaQuery('(pointer: fine)');
  const [opened, setOpened] = useState<Opened | null>(null);
  const close = useCallback(() => setOpened(null), []);

  // A new page replaces the old one under an open menu.
  useEffect(() => setOpened(null), [location.pathname]);

  useEffect(() => {
    if (!mouse) return;
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[data-native-contextmenu]')) return;
      e.preventDefault();

      const field = textField(target);
      const editable = target?.closest('[contenteditable=""], [contenteditable="true"]') ?? null;
      const link = target?.closest('a[href]') as HTMLAnchorElement | null;
      // Read the selection now: opening the menu moves focus and the page selection may collapse.
      const start = field?.selectionStart ?? 0;
      const end = field?.selectionEnd ?? 0;
      const selected = field ? field.value.slice(start, end) : (window.getSelection()?.toString() ?? '');
      const writable = Boolean(field && !field.readOnly && !field.disabled) || Boolean(editable);
      const hasText = selected.length > 0;

      const entries: MenuEntry[] = [];
      const sep = (id: string) => entries.push({ type: 'separator', id });

      if (field || editable) {
        entries.push(
          {
            id: 'cut',
            label: t('Potong'),
            icon: 'scissors',
            shortcut: 'Ctrl X',
            disabled: !writable || !hasText,
            onSelect: async () => {
              await copyText(selected);
              if (field) {
                field.focus();
                field.setRangeText('', start, end, 'end');
                announce(field);
              } else {
                document.execCommand('delete');
              }
            },
          },
          { id: 'copy', label: t('Salin'), icon: 'copy', shortcut: 'Ctrl C', disabled: !hasText, onSelect: () => void copyText(selected) },
          {
            id: 'paste',
            label: t('Tempel'),
            icon: 'clipboard',
            shortcut: 'Ctrl V',
            disabled: !writable,
            onSelect: async () => {
              let text = '';
              try {
                text = (await navigator.clipboard?.readText?.()) ?? '';
              } catch {
                return; // clipboard access refused: nothing to paste
              }
              if (!text) return;
              if (field) {
                field.focus();
                field.setRangeText(text, start, end, 'end');
                announce(field);
              } else {
                document.execCommand('insertText', false, text);
              }
            },
          },
          {
            id: 'select-all',
            label: t('Pilih semua'),
            icon: 'select-all',
            shortcut: 'Ctrl A',
            onSelect: () => {
              if (field) {
                field.focus();
                field.select();
              } else {
                (editable as HTMLElement | null)?.focus();
                document.execCommand('selectAll');
              }
            },
          },
        );
        sep('after-edit');
      } else if (hasText) {
        entries.push({ id: 'copy', label: t('Salin'), icon: 'copy', shortcut: 'Ctrl C', onSelect: () => void copyText(selected) });
        sep('after-copy');
      }

      if (link) {
        const href = link.getAttribute('href') ?? '';
        const internal = href.startsWith('/') && !href.startsWith('//');
        entries.push(
          {
            id: 'open-link',
            label: t('Buka tautan'),
            icon: internal ? 'arrow-right' : 'external-link',
            onSelect: () => (internal ? navigate(href) : window.open(link.href, '_blank', 'noopener,noreferrer')),
          },
          { id: 'copy-link', label: t('Salin alamat tautan'), icon: 'link', onSelect: () => void copyText(link.href) },
        );
        sep('after-link');
      }

      entries.push(
        { id: 'back', label: t('Kembali'), icon: 'arrow-left', shortcut: 'Alt ←', disabled: window.history.length <= 1, onSelect: () => navigate(-1) },
        { id: 'forward', label: t('Maju'), icon: 'arrow-right', shortcut: 'Alt →', onSelect: () => navigate(1) },
        { id: 'reload', label: t('Muat ulang'), icon: 'refresh', shortcut: 'Ctrl R', onSelect: () => window.location.reload() },
      );
      sep('after-nav');
      entries.push(
        { id: 'search', label: t('Cari di Stuby'), icon: 'search', shortcut: 'Ctrl K', onSelect: onSearch },
        { id: 'theme', label: t('Ganti tema'), icon: 'sun', onSelect: toggleTheme },
        { id: 'settings', label: t('Pengaturan'), icon: 'settings', onSelect: () => navigate('/pengaturan') },
      );

      setOpened({ x: e.clientX, y: e.clientY, entries });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [mouse, navigate, onSearch, t, toggleTheme]);

  if (!opened) return null;
  return <ContextMenu x={opened.x} y={opened.y} entries={opened.entries} onClose={close} label={t('Menu klik kanan')} />;
}
