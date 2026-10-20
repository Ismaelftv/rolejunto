import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { useTitle } from '../components/ui';
import { FEATURED } from '../data/activities';
import { CONFIG } from '../lib/config';
import { useI18n } from '../i18n';

const BENEFIT_ICONS: IconName[] = ['calendar', 'wallet', 'shield', 'star'];

export default function BecomePartner() {
  const { d, f } = useI18n();
  useTitle(d.nav.partner);
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-left">
            <span className="eyebrow">{d.become.eyebrow}</span>
            <h1 className="display h-xl">{d.become.titleA} <span style={{ color: 'var(--accent)' }}>{d.become.titleB}</span></h1>
            <p className="muted" style={{ fontSize: 20, maxWidth: 540 }}>{d.become.text}</p>
            <div className="row wrap gap-12">
              <Link to="/cadastro?tipo=parceiro" className="btn btn-primary btn-lg">{d.become.cta}</Link>
              <Link to="/diretrizes" className="btn btn-light btn-lg">{d.become.guidelines}</Link>
            </div>
          </div>
          <div className="hero-right">
            <div className="grid-2" style={{ maxWidth: 440, gap: 12, width: '100%' }}>
              {FEATURED.map((a, i) => (
                <div key={a.key} className="feat-tile" style={{ background: a.color, minHeight: 150, gridColumn: i === 0 ? 'span 2' : undefined }}>
                  <Icon d={a.icon} size={110} width={1.6} className="glyph" />
                  <span className="ib"><Icon d={a.icon} size={24} width={2.1} /></span>
                  <span className="nm" style={{ fontSize: 22 }}>{d.act[a.key].label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container stack gap-32">
          <h2 className="display h-lg">{d.become.whyTitle}</h2>
          <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))' }}>
            {d.become.benefits.map(([t, dd], i) => (
              <div key={t} className="card card-pad stack gap-8">
                <span className="icon-box" style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name={BENEFIT_ICONS[i]} /></span>
                <strong style={{ fontSize: 18 }}>{t}</strong><span className="muted small">{dd}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container stack gap-24" style={{ maxWidth: 820 }}>
          <h2 className="display h-lg">{d.become.howTitle}</h2>
          {d.become.steps.map(([t, dd], i) => (
            <div key={t} className="row gap-16" style={{ alignItems: 'flex-start' }}>
              <span className="step-num" style={{ background: 'var(--accent)', color: '#fff' }}>{i + 1}</span>
              <div className="stack"><strong style={{ fontSize: 19 }}>{t}</strong><span className="muted">{f(dd, { n: CONFIG.minAge })}</span></div>
            </div>
          ))}
          <div className="notice notice-dark"><Icon name="alert" stroke="var(--teal-light)" /><span>{d.become.warnA} <strong>{d.become.warnB}</strong>{d.become.warnC}</span></div>
          <Link to="/cadastro?tipo=parceiro" className="btn btn-primary btn-lg" style={{ alignSelf: 'flex-start' }}>{d.become.start}</Link>
        </div>
      </section>
    </>
  );
}
