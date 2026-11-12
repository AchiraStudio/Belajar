import React, { useRef } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Dropdown } from './Dropdown';
import { Icon, type IconName } from './Icon';
import styles from './ui.module.css';
import { tr } from '../../services/i18n';

export interface TabItem {
  id: string;
  label: string;
  icon?: IconName;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'segmented' | 'underline';
  className?: string;
  /** Accessible name of the tab set (also names the dropdown it becomes on a phone). */
  label?: string;
}

/** More tabs than this stop fitting side by side on a phone and become a dropdown there. */
const MAX_INLINE_TABS_ON_PHONE = 3;

export function Tabs({
  items,
  activeTab,
  onChange,
  variant = 'segmented',
  className = '',
  label,
}: TabsProps) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const phone = useMediaQuery('(max-width: 768px)');

  if (phone && items.length > MAX_INLINE_TABS_ON_PHONE) {
    return (
      <Dropdown
        aria-label={label ?? tr('Pilih tampilan')}
        className={className}
        value={activeTab}
        onChange={onChange}
        options={items.map((item) => ({
          value: item.id,
          label: item.count !== undefined ? `${item.label} (${item.count})` : item.label,
          icon: item.icon,
        }))}
      />
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % items.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + items.length) % items.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = items.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = items[nextIndex];
    if (nextTab) {
      onChange(nextTab.id);
      tabsRef.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`${styles.tabList} ${styles[variant]} ${className}`.trim()}
    >
      {items.map((item, index) => {
        const isActive = item.id === activeTab;
        return (
          <button
            key={item.id}
            ref={(el) => {
              tabsRef.current[index] = el;
            }}
            role="tab"
            type="button"
            id={`tab-${item.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${item.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
          >
            {item.icon && <Icon name={item.icon} size={16} />}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span className={styles.tabBadge}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
