import { CPK_THRESHOLDS, type Measurement, shaftLabel } from '@pam/core';
import { useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { Rating } from '../lib/api';

export const ANGLE_COLOR: Record<number, string> = {
  0: 'var(--a0)',
  90: 'var(--a90)',
  180: 'var(--a180)',
  270: 'var(--a270)',
};

export function Gauge({ value, rating }: { value: number | null; rating: Rating | null }) {
  const { t, num } = useI18n();
  const max = 2.5;
  const cx = 100;
  const cy = 96;
  const r = 78;
  const pt = (v: number, rr = r) => {
    const a = Math.PI * (1 - Math.min(Math.max(v, 0), max) / max);
    return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)] as const;
  };
  const arc = (v0: number, v1: number, color: string) => {
    const [x0, y0] = pt(v0);
    const [x1, y1] = pt(v1);
    return (
      <path
        d={`M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`}
        stroke={color}
        strokeWidth="12"
        fill="none"
      />
    );
  };
  const gap = 0.015;
  const L = CPK_THRESHOLDS;
  const needle = value === null ? null : pt(value, r - 18);
  return (
    <svg
      viewBox="0 0 200 112"
      role="img"
      aria-label={`${t('gauge.label')} ${num(value, 2)}, ${t(`rating.${rating ?? 'none'}`)}`}
    >
      {arc(0, L.warning - gap, 'var(--crit-fill)')}
      {arc(L.warning + gap, L.good - gap, 'var(--warn-fill)')}
      {arc(L.good + gap, L.excellent - gap, 'var(--good-fill)')}
      {arc(L.excellent + gap, max, 'var(--exc-fill)')}
      {[L.warning, L.good, L.excellent].map((v) => {
        const [x, y] = pt(v, r + 14);
        return (
          <text key={v} x={x.toFixed(1)} y={(y + 3).toFixed(1)} textAnchor="middle" style={{ fontSize: 8 }}>
            {num(v, 2)}
          </text>
        );
      })}
      {needle && (
        <>
          <line
            x1={cx}
            y1={cy}
            x2={needle[0].toFixed(1)}
            y2={needle[1].toFixed(1)}
            stroke="var(--fg)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r="6" fill="var(--fg)" />
        </>
      )}
    </svg>
  );
}

interface ScatterProps {
  points: Measurement[];
  limit: number;
  coefficient: number;
  colorOf(p: Measurement): string;
  label: string;
  small?: boolean;
  highlight?: number | null;
  /** Show a tooltip with the values of the point under the pointer. */
  interactive?: boolean;
}

/** X/Y offsets in µm with the tolerance square ±coefficient. */
export function Scatter({ points, limit, coefficient, colorOf, label, small, highlight, interactive }: ScatterProps) {
  const { t, num } = useI18n();
  const S = small ? 240 : 380;
  const P = small ? 22 : 30;
  const W = S - 2 * P;
  const sx = (v: number) => P + ((v + limit) / (2 * limit)) * W;
  const sy = (v: number) => P + ((limit - v) / (2 * limit)) * W;
  const step = limit > 60 ? 25 : limit > 30 ? 10 : 5;
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ m: Measurement; left: number; top: number } | null>(null);
  const byLine = useMemo(() => new Map(points.map((m) => [m.lineNumber, m])), [points]);

  const ticks: number[] = [];
  for (let v = -Math.floor(limit / step) * step; v <= limit; v += step) ticks.push(v);

  function show(e: React.MouseEvent) {
    const target = (e.target as Element).closest('circle.pt') as SVGCircleElement | null;
    const box = wrap.current?.parentElement?.getBoundingClientRect();
    if (!target || !box) return setTip(null);
    const m = byLine.get(Number(target.dataset.i));
    if (!m) return setTip(null);
    const pt = target.getBoundingClientRect();
    setTip({
      m,
      left: Math.min(Math.max(pt.left - box.left + 10, 8), box.width - 190),
      top: Math.max(pt.top - box.top - 64, 8),
    });
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: the tooltip only repeats values that the tables show for keyboard and screen reader users */}
      <div
        className="plot"
        ref={wrap}
        onMouseMove={interactive ? show : undefined}
        onClick={interactive ? show : undefined}
        onMouseLeave={() => setTip(null)}
      >
        <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={label}>
          <rect
            className="tol"
            x={sx(-coefficient)}
            y={sy(coefficient)}
            width={sx(coefficient) - sx(-coefficient)}
            height={sy(-coefficient) - sy(coefficient)}
            rx="2"
          />
          {ticks.map((v) => (
            <g key={v}>
              {v !== 0 && (
                <>
                  <line className="grid" x1={sx(v)} y1={P} x2={sx(v)} y2={S - P} />
                  <line className="grid" x1={P} y1={sy(v)} x2={S - P} y2={sy(v)} />
                </>
              )}
              {(!small || v % (step * 2) === 0) && (
                <>
                  <text x={sx(v)} y={S - P + 13} textAnchor="middle">
                    {v}
                  </text>
                  <text x={P - 5} y={sy(v) + 3} textAnchor="end">
                    {v}
                  </text>
                </>
              )}
            </g>
          ))}
          <line className="zero" x1={sx(0)} y1={P} x2={sx(0)} y2={S - P} />
          <line className="zero" x1={P} y1={sy(0)} x2={S - P} y2={sy(0)} />
          {!small && (
            <>
              <text x={S - P} y={sy(0) - 5} textAnchor="end">
                X µm
              </text>
              <text x={sx(0) + 5} y={P + 9}>
                Y µm
              </text>
            </>
          )}
          {points.map((p) => {
            const dim = highlight != null && p.shaft !== highlight;
            return (
              <circle
                key={p.lineNumber}
                className="pt"
                data-i={p.lineNumber}
                cx={sx(p.x).toFixed(1)}
                cy={sy(p.y).toFixed(1)}
                r={highlight != null && !dim ? 3.4 : small ? 2.3 : 2.4}
                style={{ fill: colorOf(p), opacity: dim ? 0.1 : undefined }}
              />
            );
          })}
        </svg>
      </div>
      {tip && (
        <div className="tip" style={{ left: tip.left, top: tip.top }}>
          {t('holder.name', { h: shaftLabel(tip.m.shaft) })} · {tip.m.angle}°
          <br />X <b>{num(tip.m.x)}</b> · Y <b>{num(tip.m.y)}</b> µm
          <br />Q <b>{num(tip.m.q)}</b>° · {t('tip.line', { n: tip.m.lineNumber })}
        </div>
      )}
    </>
  );
}
