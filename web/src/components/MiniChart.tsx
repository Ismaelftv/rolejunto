// Gráfico simples em SVG (linhas ou colunas) para o painel admin.
// Linhas de 2px, colunas de até 24px com topo arredondado, grade fina, dica ao passar o mouse e tabela acessível.
import { useEffect, useRef, useState } from 'react';

export interface Series { key: string; label: string; color: string; values: number[] }

interface Props {
  title: string;
  sub?: string;
  labels: string[]; // AAAA-MM-DD
  series: Series[];
  kind?: 'line' | 'bar';
  format?: (n: number) => string;
  tableLabel: string;
  dateLabel: string;
  locale: string;
  integer?: boolean; // contagens: eixo só com números inteiros
}

const H = 180;
const PAD = { top: 12, right: 12, bottom: 26, left: 44 };

/** Teto "redondo" para o eixo (1, 2, 5 × 10^n). */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export function MiniChart({ title, sub, labels, series, kind = 'line', format = (n) => n.toLocaleString(), tableLabel, dateLabel, locale, integer }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const rawMax = Math.max(0, ...series.flatMap((s) => s.values));
  const max = integer ? Math.max(2, niceMax(rawMax) % 2 ? niceMax(rawMax) + 1 : niceMax(rawMax)) : niceMax(rawMax);
  const iw = w - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const step = iw / Math.max(1, n);
  const x = (i: number) => PAD.left + step * i + step / 2;
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const xTicks = n ? [0, Math.floor((n - 1) / 2), n - 1] : [];
  const k = Math.max(1, series.length);
  const barW = Math.min(24, Math.max(2, (step - 2 - (k - 1) * 2) / k)); // ≤ 24px; 2px de respiro entre colunas e entre séries

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - PAD.left) / step);
    setHover(i >= 0 && i < n ? i : null);
  };

  const totals = series.map((s) => s.values.reduce((a, b) => a + b, 0));
  const tipLeft = hover === null ? 0 : Math.min(Math.max(x(hover) - 80, 0), w - 168);

  return (
    <div className="card card-pad stack gap-12">
      <div className="row wrap between gap-8" style={{ alignItems: 'flex-start' }}>
        <div className="stack">
          <strong>{title}</strong>
          {sub && <span className="xs muted">{sub}</span>}
        </div>
        {series.length > 1 && (
          <div className="row wrap gap-12" aria-hidden>
            {series.map((s, i) => (
              <span key={s.key} className="row gap-4 xs bold" style={{ color: 'var(--ink)' }}>
                <span style={{ width: kind === 'bar' ? 10 : 14, height: kind === 'bar' ? 10 : 3, borderRadius: kind === 'bar' ? 3 : 2, background: s.color, display: 'inline-block' }} />
                {s.label} <span className="muted" style={{ fontWeight: 500 }}>{format(totals[i])}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div ref={wrap} style={{ position: 'relative' }}>
        <svg width={w} height={H} role="img" aria-label={`${title}. ${series.map((s, i) => `${s.label}: ${format(totals[i])}`).join(', ')}`} style={{ display: 'block', touchAction: 'pan-y' }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} stroke="#E8EAF0" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#7A8194">{format(t)}</text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={11} fill="#7A8194">{day(labels[i])}</text>
          ))}

          {kind === 'bar' && series.map((sr, si) => sr.values.map((v, i) => {
            if (v <= 0) return null;
            const top = y(v); const h = PAD.top + ih - top; const r = Math.min(4, h, barW / 2);
            const x0 = x(i) - (k * barW + (k - 1) * 2) / 2 + si * (barW + 2); const x1 = x0 + barW; const base = PAD.top + ih;
            return (
              <path key={`${sr.key}-${i}`} fill={sr.color} opacity={hover === null || hover === i ? 1 : 0.45}
                d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${base} Z`} />
            );
          }))}

          {kind === 'line' && series.map((s) => (
            <polyline key={s.key} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          ))}
          {kind === 'line' && series.map((s) => (
            <circle key={`${s.key}-end`} cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
          ))}

          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="#9AA1B2" strokeWidth={1} />
              {kind === 'line' && series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />)}
            </g>
          )}
          <rect x={PAD.left} y={PAD.top} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove} />
        </svg>

        {hover !== null && (
          <div role="status" style={{ position: 'absolute', top: 0, left: tipLeft, width: 168, pointerEvents: 'none', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 8px 24px rgba(18,24,38,.12)', padding: '8px 10px' }}>
            <div className="xs bold" style={{ marginBottom: 4 }}>{day(labels[hover])}</div>
            {series.map((s) => (
              <div key={s.key} className="row between gap-8 xs">
                <span className="row gap-4"><span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} /> {s.label}</span>
                <strong>{format(s.values[hover] ?? 0)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="xs">
        <summary className="muted bold" style={{ cursor: 'pointer' }}>{tableLabel}</summary>
        <div className="table-wrap" style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>{dateLabel}</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
            <tbody>
              {labels.map((l, i) => <tr key={l}><td>{day(l)}</td>{series.map((s) => <td key={s.key}>{format(s.values[i] ?? 0)}</td>)}</tr>).reverse()}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
