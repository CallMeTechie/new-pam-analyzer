import { machineLabel } from '@pam/core';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { type MessageKey, useI18n } from '../i18n';
import type { ApiError, Family, Rating, ResultRow } from '../lib/api';
import { useScope } from '../lib/scope';
import { Icon, type IconName } from './Icon';

export const ratingClass = (r: Rating | null | undefined) => `r-${r ?? 'none'}`;

export function RatingPill({
  rating,
  value,
  small,
}: {
  rating: Rating | null;
  value?: number | null;
  small?: boolean;
}) {
  const { t, num } = useI18n();
  return (
    <span className={`pill ${ratingClass(rating)}${small ? ' small' : ''}`}>
      {value !== undefined && <span className="mono">{num(value, 2)}</span>}
      {value !== undefined && <span aria-hidden="true">·</span>}
      <span>{t(`rating.${rating ?? 'none'}`)}</span>
    </span>
  );
}

const FAMILY_LETTER: Record<Family, string> = { nxt: 'N', nxtr: 'R', aimex: 'A', unknown: '?' };

export function FamilyIcon({ family }: { family: Family }) {
  const { t } = useI18n();
  return (
    <span className={`fam fam-${family}`} title={t(`family.${family}`)}>
      {FAMILY_LETTER[family]}
    </span>
  );
}

/** "V12 · SN 900026", DX with tool: "DX R12 · SN 900032". */
export function headLabel(r: { headType: string; headSerial: string; toolType?: string | null }, sn = 'SN'): string {
  const head = r.headType === 'DX' && r.toolType ? `DX ${r.toolType}` : r.headType;
  return `${head} · ${sn} ${r.headSerial}`;
}

/** Colour of the component status computed by the calculation core. */
export const COMPONENT_RATING: Record<string, Rating | null> = {
  complete: 'excellent',
  warning: 'warning',
  incomplete: 'critical',
  unknown: null,
};

export function PartsBar({
  measured,
  expected,
  status,
}: {
  measured: number;
  expected: number | null;
  status: string;
}) {
  const { int, t } = useI18n();
  const pct = expected ? Math.min(100, (measured / expected) * 100) : 100;
  return (
    <span className={`parts ${ratingClass(COMPONENT_RATING[status] ?? null)}`} title={t(`comp.${status}` as never)}>
      <span className="bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="mono">
        {int(measured)}
        {expected ? ` / ${int(expected)}` : ''}
      </span>
    </span>
  );
}

export function ResultListRow({
  row,
  showCompany,
  extra,
  selected,
}: {
  row: ResultRow;
  showCompany?: boolean;
  /** Additional status at the end of the row, e.g. the upload state in the app. */
  extra?: ReactNode;
  /** Shown next to the list (app on tablets). */
  selected?: boolean;
}) {
  const { date, t } = useI18n();
  const scope = useScope();
  return (
    <Link
      to={scope.link(`/results/${row.id}`)}
      className={selected ? 'result-row selected' : 'result-row'}
      {...(selected ? { 'aria-current': 'true' as const } : {})}
    >
      <FamilyIcon family={row.machineFamily} />
      <span className="rr-main">
        <b>{headLabel(row, t('fact.sn'))}</b>
        <span>
          {machineLabel(row.machineNo, t('machine.sn'))}
          {row.line ? ` · ${row.line}` : ''}
          {showCompany ? ` · ${row.companyName ?? t('company.unassigned')}` : ''}
        </span>
      </span>
      <PartsBar measured={row.measured} expected={row.expected} status={row.componentStatus} />
      <span className="pill plain" title={t(`dateSource.${row.dateSource}`)}>
        {date(row.testDate)}
      </span>
      <RatingPill rating={row.rating} value={row.cpkXY} />
      {extra}
    </Link>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="loading" role="status" aria-label={t('common.loading')}>
      <span className="spinner" />
    </div>
  );
}

export function errorText(t: (k: MessageKey, v?: Record<string, string | number>) => string, error: ApiError | Error) {
  const code = 'code' in error ? error.code : 'internal_error';
  const key = `error.${code}` as MessageKey;
  const text = t(key);
  return text === key ? t('error.internal_error') : text;
}

export function Notice({
  kind = 'warning',
  title,
  children,
}: {
  kind?: 'warning' | 'info' | 'error' | 'success';
  title?: ReactNode;
  children?: ReactNode;
}) {
  const icon: IconName = kind === 'info' ? 'info' : kind === 'success' ? 'checkCircle' : 'warning';
  return (
    <div className={`notice ${kind === 'warning' ? '' : kind}`} role={kind === 'error' ? 'alert' : 'note'}>
      <Icon name={icon} size={20} />
      <div>
        {title && <b>{title}</b>}
        {children}
      </div>
    </div>
  );
}

export function ErrorNotice({ error }: { error: ApiError | Error }) {
  const { t } = useI18n();
  return <Notice kind="error" title={errorText(t, error)} />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      prev?.focus();
    };
  }, [onClose]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking the backdrop is a shortcut; Escape and the buttons close the dialog too
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function CopyButton({ value }: { value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} />
      {copied ? t('common.copied') : t('common.copy')}
    </button>
  );
}

/** Form field whose hint and error are linked to the input (not part of its accessible name). */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children(props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }): ReactNode;
}) {
  const id = useId();
  const described = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        ...(described ? { 'aria-describedby': described } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {hint && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error-text" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

/** (i) icon with an explanation shown on hover, focus or tap; replaces explanatory paragraphs. */
export function InfoTip({ text, label }: { text: ReactNode; label?: string }) {
  const { t } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only opens the tip early; the button handles focus, click and Escape
    <span className="infotip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="infotip-btn"
        aria-label={label ?? t('common.info')}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <Icon name="info" size={16} />
      </button>
      {open && (
        <span role="tooltip" id={id} className="infotip-text">
          {text}
        </span>
      )}
    </span>
  );
}

/** Company logo, or the initials when there is none. */
export function CompanyBadge({
  company,
  size = 40,
}: {
  company: { id: number; name: string; isService?: boolean; logoVersion?: number | null };
  size?: number;
}) {
  const initials =
    company.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.round(size * 0.36) };
  if (company.logoVersion) {
    return (
      <span className="company-badge logo" style={style}>
        <img src={`/api/companies/${company.id}/logo?v=${company.logoVersion}`} alt={company.name} />
      </span>
    );
  }
  return (
    <span className={`company-badge${company.isService ? ' service' : ''}`} style={style} aria-hidden="true">
      {initials}
    </span>
  );
}
