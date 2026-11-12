import React from 'react';
import { tr } from '../../services/i18n';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon';
import { StatusBadge } from './StatusBadge';
import styles from './ui.module.css';

export interface UnavailableStateProps {
  icon?: IconName;
  title: string;
  description: string;
  /** What the product still needs before this becomes real. Shown as an honest checklist. */
  requirements?: string[];
  action?: { to: string; label: string };
  badge?: string;
}

/**
 * Honest "not available yet" screen. Used wherever a capability has no working service behind it:
 * we say so, and never render fake data or a simulated success.
 */
export function UnavailableState({
  icon = 'info',
  title,
  description,
  requirements,
  action,
  badge = tr('Belum tersedia'),
}: UnavailableStateProps) {
  return (
    <section className={styles.unavailable} aria-labelledby="unavailable-title">
      <span className={styles.unavailableIcon}>
        <Icon name={icon} size={28} />
      </span>
      <StatusBadge status="neutral" label={badge} />
      <h2 id="unavailable-title" className={styles.unavailableTitle}>
        {tr(title)}
      </h2>
      <p className={styles.unavailableText}>{tr(description)}</p>
      {requirements && requirements.length > 0 && (
        <div className={styles.unavailableReq}>
          <div className={styles.unavailableReqTitle}>{tr('Yang dibutuhkan sebelum fitur ini aktif')}</div>
          <ul>
            {requirements.map((r) => (
              <li key={r}>{tr(r)}</li>
            ))}
          </ul>
        </div>
      )}
      {action && (
        <Link to={action.to} className={styles.unavailableLink}>
          {tr(action.label)}
          <Icon name="arrow-right" size={16} />
        </Link>
      )}
    </section>
  );
}
