import {
  ALGORITHM_VERSION,
  type AnalysisResult,
  analyzePamFile,
  type CpkThresholds,
  machineLabel,
  type ParsedPamFile,
} from '@pam/core';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ANGLE_COLOR, Gauge, Scatter } from '../components/charts';
import { EditResultDialog } from '../components/EditResult';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import {
  COMPONENT_RATING,
  CompanyBadge,
  ErrorNotice,
  headLabel,
  Loading,
  Modal,
  Notice,
  ratingClass,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api, type ResultDetail as Detail, type Rating } from '../lib/api';
import { useUser } from '../lib/auth';
import { useScope } from '../lib/scope';
import { useApi } from '../lib/useApi';

const AXES = ['x', 'y', 'q'] as const;
const attention = (r: Rating | null) => r === 'critical' || r === 'warning';

function Notes({ detail, result }: { detail: Detail; result: AnalysisResult }) {
  const { t } = useI18n();
  const byReason = new Map<string, number[]>();
  for (const l of detail.invalidLines) byReason.set(l.reason, [...(byReason.get(l.reason) ?? []), l.lineNumber - 1]);
  const items = [
    ...detail.warnings.map((w) => t(`warning.${w.code}` as never)),
    ...[...byReason]
      .filter(([r]) => r !== 'placeholder')
      .map(([r, nums]) =>
        t('notice.lines', {
          n: nums.length,
          reason: t(`reason.${r}` as never),
          list: nums.slice(0, 12).join(', ') + (nums.length > 12 ? ' …' : ''),
        }),
      ),
  ];
  if (result.coefficientSource === 'default') {
    items.push(t('notice.defaultCoef', { head: detail.header.headType, coef: result.coefficient }));
  }
  const placeholders = byReason.get('placeholder')?.length ?? 0;
  const info = placeholders ? t('notice.placeholders', { n: placeholders }) : '';
  if (items.length) {
    return (
      <Notice title={t('notice.title', { n: items.length })}>
        <ul>
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {info && (
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            {info}
          </p>
        )}
      </Notice>
    );
  }
  return info ? <Notice kind="info">{info}</Notice> : null;
}

function Boxes({
  result,
  coefficient,
  setCoefficient,
  headType,
  toolType,
}: {
  result: AnalysisResult;
  coefficient: number | null;
  setCoefficient(v: number | null): void;
  headType: string;
  toolType: string | null;
}) {
  const { t, num, int } = useI18n();
  const head = result.head;
  const axes = [head.x, head.y, head.q];
  const thead = (
    <thead>
      <tr>
        <th />
        <th>
          X <small>µm</small>
        </th>
        <th>
          Y <small>µm</small>
        </th>
        <th>
          Q <small>deg</small>
        </th>
      </tr>
    </thead>
  );
  const complete = result.expectedComponents !== null && result.measuredComponents === result.expectedComponents;
  const compRating = COMPONENT_RATING[result.componentStatus] ?? null;
  const set = (v: number) => setCoefficient(Number.isFinite(v) && v >= 1 && v <= 1000 ? Math.round(v) : null);
  const coefSub =
    result.coefficientSource === 'manual' ? (
      <>
        {t('coef.manual')} ·{' '}
        <button type="button" className="linkbtn" onClick={() => setCoefficient(null)}>
          {t('coef.reset', { v: result.detectedCoefficient })}
        </button>
      </>
    ) : result.coefficientSource === 'default' ? (
      t('coef.default')
    ) : (
      t('coef.auto', { head: headType === 'DX' ? (toolType ?? 'DX') : headType })
    );
  return (
    <div className="boxes">
      <section className="card box">
        <div className="box-h">
          <h3>{t('box.head')}</h3>
          <span>±{result.coefficient} µm</span>
        </div>
        <table className="bt">
          {thead}
          <tbody>
            <tr>
              <th title={t('row.aveSigmaTitle')}>{t('row.aveSigma')}</th>
              {axes.map((a, i) => (
                <td key={AXES[i]}>{num(Math.abs(a.mean) + a.sigma3)}</td>
              ))}
            </tr>
            <tr>
              <th>{t('row.cp')}</th>
              <td>{num(head.x.cp)}</td>
              <td>{num(head.y.cp)}</td>
              <td>–</td>
            </tr>
            <tr>
              <th>{t('row.cpk')}</th>
              {[head.x, head.y].map((a, i) => (
                <td key={AXES[i]}>
                  <span className={`cpk ${ratingClass(a.rating)}`} title={t(`rating.${a.rating ?? 'none'}`)}>
                    {num(a.cpk)}
                  </span>
                </td>
              ))}
              <td>–</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section className="card box">
        <div className="box-h">
          <h3>{t('box.total')}</h3>
          <span>{t('box.points', { n: result.measuredComponents })}</span>
        </div>
        <table className="bt">
          {thead}
          <tbody>
            {(
              [
                ['row.average', 'mean'],
                ['row.sigma', 'sigma3'],
                ['row.max', 'max'],
                ['row.min', 'min'],
              ] as const
            ).map(([label, key]) => (
              <tr key={key}>
                <th>{t(label)}</th>
                {axes.map((a, i) => (
                  <td key={AXES[i]}>{num(a[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card box box-coef no-print">
        <div className="box-h">
          <h3>{t('box.coef')}</h3>
        </div>
        <div className="tiles">
          <div className="tile">
            <label className="t-lbl" htmlFor="coef">
              {t('tile.coef')}
            </label>
            <div className="stepper">
              <button type="button" aria-label={t('coef.dec')} onClick={() => set(result.coefficient - 1)}>
                −
              </button>
              <input
                id="coef"
                type="number"
                min={1}
                max={1000}
                key={coefficient ?? 'auto'}
                defaultValue={result.coefficient}
                onBlur={(e) => set(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') set(Number(e.currentTarget.value));
                }}
                aria-describedby="coef-sub"
              />
              <button type="button" aria-label={t('coef.inc')} onClick={() => set(result.coefficient + 1)}>
                +
              </button>
            </div>
            <span className="t-sub" id="coef-sub">
              ±µm · {coefSub}
            </span>
          </div>
          <div className={`tile comp ${ratingClass(compRating)}`}>
            <span className="t-lbl">{t('tile.parts')}</span>
            <span className="t-val">
              {complete
                ? `${int(result.measuredComponents)} ✓`
                : `${int(result.measuredComponents)}${result.expectedComponents ? ` / ${int(result.expectedComponents)}` : ''}`}
            </span>
            <span className="t-sub">
              {[
                result.expectedComponents && !complete
                  ? `${num((result.measuredComponents / result.expectedComponents) * 100, 1)} %`
                  : '',
                t(`comp.${result.componentStatus}` as never),
                result.failedMeasurements ? t('parts.failed', { n: result.failedMeasurements }) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function Overall({ parsed, result }: { parsed: ParsedPamFile; result: AnalysisResult }) {
  const { t } = useI18n();
  const [highlight, setHighlight] = useState<number | null>(null);
  const limit = Math.max(result.axisLimits.x.max, result.axisLimits.y.max);
  const n = Math.max(result.shafts.length, 1);
  const shaftColor = (s: number) => `hsl(${Math.round(((s - 1) / n) * 330)} 68% 46%)`;
  const hl = result.shafts.find((s) => s.shaft === highlight);
  return (
    <section className="stack overall">
      <div className="section-h no-print">
        <div>
          <h2>{t('overall.title')}</h2>
          <p>{t('overall.sub', { coef: result.coefficient })}</p>
        </div>
      </div>
      <div className="charts">
        <div className="card chart">
          <div className="chart-h">
            <h3>{t('chart.byAngle')}</h3>
            <span>{t('chart.points', { n: parsed.measurements.length })}</span>
          </div>
          <Scatter
            points={parsed.measurements}
            limit={limit}
            coefficient={result.coefficient}
            colorOf={(p) => ANGLE_COLOR[p.angle] ?? 'var(--muted)'}
            label={t('chart.byAngle')}
            interactive
          />
          <div className="legend">
            {[0, 90, 180, 270].map((a) => (
              <span key={a} className="lg-item lg-static">
                <i style={{ background: ANGLE_COLOR[a] }} />
                {a}°
              </span>
            ))}
          </div>
        </div>
        <div className="card chart">
          <div className="chart-h">
            <h3>{t('chart.byHolder')}</h3>
            <span>{hl ? t('chart.hl', { h: hl.label }) : t('chart.hlHint')}</span>
          </div>
          <Scatter
            points={parsed.measurements}
            limit={limit}
            coefficient={result.coefficient}
            colorOf={(p) => shaftColor(p.shaft)}
            label={t('chart.byHolder')}
            highlight={highlight}
            interactive
          />
          <div className="legend">
            {result.shafts.map((s) => (
              <button
                key={s.shaft}
                type="button"
                className="lg-item"
                aria-pressed={highlight === s.shaft}
                onClick={() => setHighlight(highlight === s.shaft ? null : s.shaft)}
              >
                <i style={{ background: shaftColor(s.shaft) }} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type Shaft = AnalysisResult['shafts'][number];

function HolderCard({
  shaft: s,
  parsed,
  result,
  onOpen,
}: {
  shaft: Shaft;
  parsed: ParsedPamFile;
  result: AnalysisResult;
  /** Opens the holder enlarged (touch devices). */
  onOpen?: () => void;
}) {
  const { t, num } = useI18n();
  const limit = Math.max(result.axisLimits.x.max, result.axisLimits.y.max);
  const mark = s.shaft === result.bestShaft ? t('holder.best') : s.shaft === result.worstShaft ? t('holder.worst') : '';
  const name = t('holder.name', { h: s.label });
  return (
    <article
      className={`hcard ${ratingClass(s.rating)}${onOpen ? ' zoomable' : ''}`}
      aria-label={name}
      {...(onOpen
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: onOpen,
            onKeyDown: (e: { key: string }) => {
              if (e.key === 'Enter' || e.key === ' ') onOpen();
            },
          }
        : {})}
    >
      <div className="hcard-h">
        <span className="hbadge">{s.label}</span>
        <span className="t">
          <b>{name}</b>
          <span>
            {t('holder.parts', { n: s.count })}
            {mark ? ` · ${mark}` : ''}
          </span>
        </span>
        <span className="v">
          <b>{num(s.cpkXY, 2)}</b>
          <span>{t(`rating.${s.rating ?? 'none'}`)}</span>
        </span>
      </div>
      <Scatter
        points={parsed.measurements.filter((m) => m.shaft === s.shaft)}
        limit={limit}
        coefficient={result.coefficient}
        colorOf={(p) => ANGLE_COLOR[p.angle] ?? 'var(--muted)'}
        label={name}
        small
      />
    </article>
  );
}

/** Printout: all holders in their order, at most 12 per A4 page. */
const PRINT_HOLDERS_PER_PAGE = 12;

function PrintHolders({
  parsed,
  result,
  thresholds,
}: {
  parsed: ParsedPamFile;
  result: AnalysisResult;
  thresholds: CpkThresholds;
}) {
  const { t, num } = useI18n();
  const n = result.shafts.length;
  const count = result.shafts.filter((s) => attention(s.rating)).length;
  const lim = num(thresholds.good, 2);
  const pages: Shaft[][] = [];
  for (let i = 0; i < n; i += PRINT_HOLDERS_PER_PAGE) pages.push(result.shafts.slice(i, i + PRINT_HOLDERS_PER_PAGE));
  return (
    <>
      {pages.map((page) => (
        <section key={page[0]?.shaft} className="print-only print-holders">
          <div className="section-h">
            <h2>{t('print.holders', { from: page[0]?.label ?? '', to: page[page.length - 1]?.label ?? '', n })}</h2>
            <p>{count ? t('holders.attention', { a: count, n, limit: lim }) : t('holders.allOk', { n, limit: lim })}</p>
          </div>
          <div className="holders">
            {page.map((s) => (
              <HolderCard key={s.shaft} shaft={s} parsed={parsed} result={result} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Holders({
  parsed,
  result,
  thresholds,
}: {
  parsed: ParsedPamFile;
  result: AnalysisResult;
  thresholds: CpkThresholds;
}) {
  const { t, num } = useI18n();
  const options = useContext(ResultDetailContext);
  const [zoom, setZoom] = useState<Shaft | null>(null);
  const [sort, setSort] = useState<'holder' | 'cpk'>('holder');
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const count = result.shafts.filter((s) => attention(s.rating)).length;
  let shafts = result.shafts.slice();
  if (filter === 'attention') shafts = shafts.filter((s) => attention(s.rating));
  if (sort === 'cpk')
    shafts.sort((a, b) => (a.cpkXY ?? Number.POSITIVE_INFINITY) - (b.cpkXY ?? Number.POSITIVE_INFINITY));
  const lim = num(thresholds.good, 2);
  return (
    <section className="stack no-print">
      <div className="section-h">
        <div>
          <h2>{t('holders.title')}</h2>
          <p>
            {count
              ? t('holders.attention', { a: count, n: result.shafts.length, limit: lim })
              : t('holders.allOk', { n: result.shafts.length, limit: lim })}
          </p>
        </div>
        <div className="filters" style={{ gap: 8 }}>
          <div className="seg" role="group" aria-label={t('sort.label')}>
            <button type="button" aria-pressed={sort === 'holder'} onClick={() => setSort('holder')}>
              {t('sort.holder')}
            </button>
            <button type="button" aria-pressed={sort === 'cpk'} onClick={() => setSort('cpk')}>
              {t('sort.cpk')}
            </button>
          </div>
          <div className="seg" role="group" aria-label={t('filter.label')}>
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              {t('filter.all', { n: result.shafts.length })}
            </button>
            <button type="button" aria-pressed={filter === 'attention'} onClick={() => setFilter('attention')}>
              {t('filter.attention', { n: count })}
            </button>
          </div>
        </div>
      </div>
      {shafts.length ? (
        <div className="holders">
          {shafts.map((s) => (
            <HolderCard
              key={s.shaft}
              shaft={s}
              parsed={parsed}
              result={result}
              {...(options.zoomHolders ? { onOpen: () => setZoom(s) } : {})}
            />
          ))}
        </div>
      ) : (
        <div className="card empty">
          {t('holders.empty', { limit: lim })}{' '}
          <button type="button" className="linkbtn" onClick={() => setFilter('all')}>
            {t('holders.showAll')}
          </button>
        </div>
      )}
      {zoom && (
        <Modal title={t('holder.name', { h: zoom.label })} onClose={() => setZoom(null)}>
          <div className="holder-zoom">
            <p className="muted">
              Cpk XY <b>{num(zoom.cpkXY, 2)}</b> · {t(`rating.${zoom.rating ?? 'none'}`)} ·{' '}
              {t('holder.parts', { n: zoom.count })}
            </p>
            <Scatter
              points={parsed.measurements.filter((m) => m.shaft === zoom.shaft)}
              limit={Math.max(result.axisLimits.x.max, result.axisLimits.y.max)}
              coefficient={result.coefficient}
              colorOf={(p) => ANGLE_COLOR[p.angle] ?? 'var(--muted)'}
              label={t('holder.name', { h: zoom.label })}
              interactive
            />
            <div className="actions">
              <button type="button" className="btn" onClick={() => setZoom(null)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** CSS string literal, safe inside a style element. */
const cssString = (v: string) => `"${v.replace(/[\\"<>\n]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;

/**
 * Footer on every printed page (print date, calculation core, rating limits, page number), drawn by the
 * browser in the page margin. `page` holds \u0001 and \u0002 where the page number and page count go.
 */
function PrintPageFooter({ left, page }: { left: string; page: string }) {
  const [before = '', rest = ''] = page.split('\u0001');
  const [middle = '', after = ''] = rest.split('\u0002');
  const counter = `${cssString(before)} counter(page) ${cssString(middle)} counter(pages) ${cssString(after)}`;
  return (
    <style>{`@media print { @page { @bottom-left { content: ${cssString(left)}; } @bottom-right { content: ${counter}; } } }`}</style>
  );
}

/**
 * Lets another host of this page (the Windows app) replace the download button with its own
 * actions, e.g. "Show in Explorer" and the upload status.
 */
export interface ResultDetailOptions {
  renderActions?(detail: Detail): ReactNode;
  /** Text after the file name instead of "uploaded <date>". */
  addedText?(detail: Detail): string;
  /** Small screens: overview, charts and holders as tabs (the printout still shows everything). */
  tabbed?: boolean;
  /** Touch devices: tapping a holder shows it enlarged. */
  zoomHolders?: boolean;
}

const DETAIL_TABS = ['overview', 'charts', 'holders'] as const;
type DetailTab = (typeof DETAIL_TABS)[number];
export const ResultDetailContext = createContext<ResultDetailOptions>({});

export function ResultDetail() {
  const options = useContext(ResultDetailContext);
  const { id } = useParams();
  const { t, int, num, dateTime, instant } = useI18n();
  const scope = useScope();
  const user = useUser();
  const navigate = useNavigate();
  const { data, error, loading } = useApi<Detail>(`/results/${id}`);
  const [coefficient, setCoefficient] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<DetailTab>('overview');
  // Sections stay rendered so that the printout shows everything; inactive tabs are only hidden.
  const sectionClass = (k: DetailTab) => `rd-sec rd-${k}${options.tabbed && tab !== k ? ' tab-off' : ''}`;
  const [printedAt, setPrintedAt] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setPrintedAt(Date.now());
    window.addEventListener('beforeprint', update);
    return () => window.removeEventListener('beforeprint', update);
  }, []);

  const parsed = useMemo<ParsedPamFile | null>(
    () =>
      data
        ? {
            fileName: data.result.fileName,
            header: data.header,
            shaftCount: data.shaftCount,
            measurements: data.measurements,
            invalidLines: data.invalidLines,
            warnings: data.warnings,
          }
        : null,
    [data],
  );
  const result = useMemo(() => {
    if (!data || !parsed) return null;
    if (coefficient === null) return data.analysis;
    return analyzePamFile(parsed, { coefficient, config: data.config, thresholds: data.thresholds });
  }, [data, parsed, coefficient]);

  const canDelete =
    data &&
    ((user.role === 'admin' && user.company.isService) ||
      (user.role === 'companyAdmin' && user.company.id === data.result.companyId));

  async function remove() {
    if (!data || !window.confirm(t('detail.deleteConfirm'))) return;
    await api.delete(`/results/${data.result.id}`);
    navigate(scope.link('/results'));
  }

  if (error) {
    return (
      <Page title={t('detail.title')}>
        <ErrorNotice error={error} />
        <div>
          <Link to={scope.link('/results')} className="btn">
            ← {t('detail.back')}
          </Link>
        </div>
      </Page>
    );
  }
  if (!data || !parsed || !result || loading) {
    return (
      <Page title={t('detail.title')}>
        <Loading />
      </Page>
    );
  }
  const h = data.header;
  const head = result.head;
  const complete = result.expectedComponents !== null && result.measuredComponents === result.expectedComponents;
  const coefMode =
    result.coefficientSource === 'manual'
      ? t('coef.manual')
      : result.coefficientSource === 'default'
        ? t('coef.default')
        : t('coef.auto', { head: h.headType === 'DX' ? (h.toolType ?? 'DX') : h.headType });
  const facts: { k: string; v: string; cls?: string }[] = [
    { k: t('fact.head'), v: h.headType },
    { k: t('fact.sn'), v: h.headSerial },
    ...(h.toolType ? [{ k: t('fact.tool'), v: h.toolType + (h.toolSerial ? ` · ${h.toolSerial}` : '') }] : []),
    ...(h.h08mVariant ? [{ k: t('fact.parts'), v: t(`parts.${h.h08mVariant}`) }] : []),
    { k: t('fact.holders'), v: int(result.shafts.length) },
    { k: t('fact.tested'), v: dateTime(data.result.testDate) },
    ...(data.result.line ? [{ k: t('fact.line'), v: data.result.line }] : []),
    ...(data.result.customer ? [{ k: t('fact.customer'), v: data.result.customer }] : []),
    // Coefficient and components have their own box on screen; the printout shows them here.
    { k: t('fact.coef'), v: `±${result.coefficient} µm · ${coefMode}`, cls: 'print-only' },
    {
      k: t('tile.parts'),
      v: complete
        ? `${int(result.measuredComponents)} ✓`
        : `${int(result.measuredComponents)}${result.expectedComponents ? ` / ${int(result.expectedComponents)}` : ''}`,
      cls: 'print-only',
    },
    ...(scope.companyId === null
      ? [
          data.result.companyName
            ? { k: t('fact.company'), v: data.result.companyName }
            : { k: t('fact.company'), v: t('company.unassigned'), cls: 'no-print' },
        ]
      : []),
  ];

  return (
    <Page
      title={headLabel(h, t('fact.sn'))}
      actions={
        <>
          <Link to={scope.link(`/results/${data.result.id}/history`)} className="btn">
            <Icon name="history" size={16} />
            <span className="label-sm-hide">{t('detail.history')}</span>
          </Link>
          <button type="button" className="btn" onClick={() => window.print()}>
            <Icon name="printer" size={16} />
            <span className="label-sm-hide">{t('detail.print')}</span>
          </button>
          {options.renderActions ? (
            options.renderActions(data)
          ) : (
            <>
              <button type="button" className="btn" onClick={() => setEditing(true)} title={t('client.assign.edit')}>
                <Icon name="edit" size={16} />
                <span className="label-sm-hide">{t('client.assign.edit')}</span>
              </button>
              <a href={`/api/results/${data.result.id}/file`} className="btn" download>
                <Icon name="download" size={16} />
                <span className="label-sm-hide">{t('detail.download')}</span>
              </a>
            </>
          )}
          {editing && <EditResultDialog detail={data} onClose={() => setEditing(false)} />}
          {canDelete && (
            <button
              type="button"
              className="btn danger icon"
              aria-label={t('detail.delete')}
              title={t('detail.delete')}
              onClick={() => void remove()}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </>
      }
    >
      <section className="card hero">
        <div>
          <div className="hero-id">
            {data.result.companyId !== null && (
              <span className="print-only">
                <CompanyBadge
                  company={{
                    id: data.result.companyId,
                    name: data.result.companyName ?? '',
                    logoVersion: data.result.companyLogoVersion,
                  }}
                  size={44}
                />
              </span>
            )}
            <div>
              <div className="eyebrow">
                <Icon name="pulse" size={14} stroke={2.4} />
                {t('hero.eyebrow', { family: t(`family.${h.machineFamily}`) })}
              </div>
              <h2>{machineLabel(h.machineNo, t('machine.sn'))}</h2>
            </div>
          </div>
          <div className="facts">
            {facts.map((f) => (
              <span key={f.k} className={f.cls ? `fact ${f.cls}` : 'fact'}>
                <span>{f.k}</span>
                <b>{f.v}</b>
              </span>
            ))}
          </div>
          <div className="file-line">
            {data.result.fileName}
            {data.result.dateSource !== 'header' && ` · ${t(`dateSource.${data.result.dateSource}`)}`}
            {` · ${options.addedText ? options.addedText(data) : t('detail.uploaded', { date: instant(data.result.createdAt) })}`}
          </div>
        </div>
        <div className={`gauge ${ratingClass(head.rating)}`}>
          <span className="g-lbl">{t('gauge.label')}</span>
          <Gauge value={head.cpkXY} rating={head.rating} thresholds={data.thresholds} />
          <span className="g-val">{num(head.cpkXY, 2)}</span>
          <span className="g-txt">{t(`rating.${head.rating ?? 'none'}`)}</span>
        </div>
      </section>

      {options.tabbed && (
        <div className="tabs rd-tabs no-print" role="tablist" aria-label={t('detail.tabs')}>
          {DETAIL_TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {t(`detail.tab.${k}`)}
            </button>
          ))}
        </div>
      )}
      <div className={sectionClass('overview')}>
        <div className="no-print">
          <Notes detail={data} result={result} />
        </div>
        <Boxes
          result={result}
          coefficient={coefficient}
          setCoefficient={setCoefficient}
          headType={h.headType}
          toolType={h.toolType}
        />
      </div>
      <div className={sectionClass('charts')}>
        <Overall parsed={parsed} result={result} />
      </div>
      <div className={sectionClass('holders')}>
        <Holders parsed={parsed} result={result} thresholds={data.thresholds} />
      </div>
      <PrintHolders parsed={parsed} result={result} thresholds={data.thresholds} />
      <PrintPageFooter
        left={[
          t('print.printed', { date: instant(printedAt) }),
          t('footer.core', { v: ALGORITHM_VERSION }),
          t('footer.rating', {
            a: num(data.thresholds.warning, 2),
            b: num(data.thresholds.good, 2),
            c: num(data.thresholds.excellent, 2),
          }),
        ].join(' · ')}
        page={t('print.page', { page: '\u0001', pages: '\u0002' })}
      />

      <footer className="detail-footer">
        <span>{t('footer.core', { v: ALGORITHM_VERSION })}</span>
        <span>
          {t('footer.config', {
            v: data.result.configVersion === 'default' ? t('footer.configDefault') : instant(data.result.configVersion),
          })}
        </span>
        <span>
          {t('footer.rating', {
            a: num(data.thresholds.warning, 2),
            b: num(data.thresholds.good, 2),
            c: num(data.thresholds.excellent, 2),
          })}
        </span>
      </footer>
    </Page>
  );
}
