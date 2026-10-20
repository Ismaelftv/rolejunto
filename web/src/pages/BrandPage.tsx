import { AltMarkJ, AltMarkRoute, LogoMark, Wordmark, markSvgString } from '../components/Brand';
import { Icon } from '../components/Icon';
import { useTitle } from '../components/ui';
import { ACTIVITIES } from '../data/activities';
import { useI18n } from '../i18n';

const BRAND_COLORS = [
  ['Ink', '#121826'], ['Coral', '#D9381E'], ['Coral (dark)', '#FF5B3D'], ['Teal', '#0B6B61'], ['Soft', '#F3F4F8'], ['White', '#FFFFFF'],
];

function download(name: string, svg: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  a.download = name;
  a.click();
}

export default function BrandPage() {
  const { d } = useI18n();
  useTitle(d.brand.title);
  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="container stack gap-32">
        <div className="stack gap-12" style={{ maxWidth: 720 }}>
          <h1 className="display h-lg">{d.brand.title}</h1>
          <p className="muted" style={{ fontSize: 18 }}>{d.brand.sub}</p>
          <p>{d.brand.concept}</p>
        </div>

        <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
          <div className="card stack gap-16" style={{ padding: 40, alignItems: 'center', justifyContent: 'center', minHeight: 220, gridColumn: '1 / -1' }}>
            <LogoMark size={160} variant="outline" title="RolêJunto" />
          </div>
          <div className="card stack gap-16" style={{ padding: 40, alignItems: 'center', justifyContent: 'center', minHeight: 260 }}>
            <span className="eyebrow" style={{ alignSelf: 'flex-start' }}>{d.brand.light}</span>
            <div className="row gap-16"><LogoMark size={80} /><Wordmark size={56} /></div>
          </div>
          <div className="card stack gap-16" style={{ padding: 40, alignItems: 'center', justifyContent: 'center', minHeight: 260, background: 'var(--brand-ink)', borderColor: 'var(--brand-ink)' }}>
            <span className="eyebrow" style={{ alignSelf: 'flex-start', color: 'var(--brand-muted)' }}>{d.brand.dark}</span>
            <div className="row gap-16"><LogoMark size={80} variant="coral" /><Wordmark size={56} dark /></div>
          </div>
        </div>

        <div className="card card-pad stack gap-16">
          <span className="eyebrow">{d.brand.icon}</span>
          <div className="row wrap gap-24" style={{ alignItems: 'flex-end' }}>
            {[160, 96, 64, 40, 24, 16].map((s) => (
              <div key={s} className="stack gap-8" style={{ alignItems: 'center' }}><LogoMark size={s} /><span className="xs muted">{s}px</span></div>
            ))}
            <div className="stack gap-8" style={{ alignItems: 'center' }}><LogoMark size={96} variant="coral" /><span className="xs muted">coral</span></div>
          </div>
          <div className="row wrap gap-8">
            <button className="btn btn-light btn-sm" onClick={() => download('rolejunto-icon.svg', markSvgString('ink'))}><Icon name="download" size={16} /> {d.brand.download} (ink)</button>
            <button className="btn btn-light btn-sm" onClick={() => download('rolejunto-icon-coral.svg', markSvgString('coral'))}><Icon name="download" size={16} /> {d.brand.download} (coral)</button>
          </div>
        </div>

        <div className="stack gap-12">
          <span className="eyebrow">{d.brand.colors}</span>
          <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {BRAND_COLORS.map(([n, c]) => (
              <div key={c} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ height: 80, background: c, borderBottom: '1px solid var(--line)' }} />
                <div className="stack" style={{ padding: 12 }}><strong className="small">{n}</strong><span className="xs muted">{c}</span></div>
              </div>
            ))}
          </div>
          <div className="row wrap gap-8">
            {ACTIVITIES.map((a) => <span key={a.key} className="badge" style={{ background: a.color, color: '#fff', padding: '8px 12px' }}>{d.act[a.key].label} · {a.color}</span>)}
          </div>
        </div>

        <div className="stack gap-12">
          <span className="eyebrow">{d.brand.alt}</span>
          <div className="row wrap gap-24">
            <div className="stack gap-8" style={{ alignItems: 'center' }}><AltMarkRoute size={110} /><span className="small muted">{d.brand.altA}</span></div>
            <div className="stack gap-8" style={{ alignItems: 'center' }}><AltMarkJ size={110} /><span className="small muted">{d.brand.altB}</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
